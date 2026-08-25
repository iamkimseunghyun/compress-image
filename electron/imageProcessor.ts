import sharp from 'sharp'
import type {
  AvifOptions, GifOptions, JpegOptions, Metadata, PngOptions, TiffOptions, WebpOptions,
} from 'sharp'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import type { ResizeOptions, OutputOptions, ProcessingResult, ProcessingProgress, ImageFileInfo } from '../src/types'

// Formats Sharp can encode. Sources outside this set (e.g. svg, heif) can be
// read but not always re-encoded, so 'original' falls back to png for them.
type WritableFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff' | 'gif'
const WRITABLE_FORMATS = new Set<string>(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'])
const isWritableFormat = (format: string): format is WritableFormat => WRITABLE_FORMATS.has(format)

type EncoderOptions = JpegOptions & PngOptions & WebpOptions & AvifOptions & TiffOptions & GifOptions

// Formats where `quality` maps to a real encoder knob. PNG and GIF are palette
// formats and must be excluded: passing `quality` to PNG makes libvips switch
// to lossy 256-colour quantisation behind the user's back (a 24-bit gradient
// drops from 356KB to 58KB) while the value itself barely moves the result
// (quality 10 vs 100 differ by 0.2%), and GIF ignores `quality` outright.
// Both are driven by the explicit `palette` option instead.
const USES_QUALITY = new Set<WritableFormat>(['jpeg', 'webp', 'avif', 'tiff'])

// Per-format encoder settings per compression mode. 'max' keeps the
// slowest-but-smallest settings this app has always used; 'fast' drops every
// encoder to its minimum effort. Measured on a 20 x 4032x3024 batch (M-series,
// 10 cores): JPEG 1410ms -> 308ms (+14% size), and per-image PNG 1107ms ->
// 121ms, GIF 1141ms -> 120ms, AVIF 481ms -> 34ms at 19-39% larger output.
// TIFF has no effort knob in libvips, so both modes share its settings.
const FORMAT_OPTIONS: Record<OutputOptions['compression'], Record<WritableFormat, EncoderOptions>> = {
  max: {
    jpeg: { mozjpeg: true },
    png: { compressionLevel: 9 },
    webp: {},
    avif: {},
    tiff: {},
    gif: {},
  },
  fast: {
    jpeg: { mozjpeg: false },
    png: { compressionLevel: 3, effort: 1 },
    webp: { effort: 0 },
    avif: { effort: 0 },
    tiff: {},
    gif: { effort: 1 },
  },
}

// Cap parallelism so very large batches don't spike memory while still using
// multiple cores. libvips parallelizes each op internally; this adds file-level
// concurrency on top.
const MAX_CONCURRENCY = 8

export async function getImageInfo(filePath: string): Promise<ImageFileInfo> {
  const metadata = await sharp(filePath).metadata()
  const stats = fs.statSync(filePath)

  // Report post-rotation dimensions so the list matches what gets written.
  const oriented = orientedSize(metadata)

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    width: oriented.width,
    height: oriented.height,
    format: metadata.format ?? 'unknown',
  }
}

export async function processImages(
  files: string[],
  resize: ResizeOptions,
  output: OutputOptions,
  onProgress: (progress: ProcessingProgress) => void,
): Promise<ProcessingResult[]> {
  // Preserve input order in results; each file keeps its original index so the
  // rename auto-numbering stays deterministic regardless of completion order.
  const results: ProcessingResult[] = new Array(files.length)
  // os.cpus() can return an empty array in some restricted environments.
  const cpuCount = os.cpus()?.length || 1
  const concurrency = Math.max(1, Math.min(files.length, cpuCount, MAX_CONCURRENCY))
  let nextIndex = 0
  let completed = 0
  // Throttle progress so concurrent completions don't flood the IPC channel.
  let lastProgressAt = 0
  const PROGRESS_THROTTLE_MS = 100

  onProgress({ current: 0, total: files.length, currentFile: '' })

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= files.length) return

      const filePath = files[i]
      try {
        results[i] = await processSingleImage(filePath, resize, output, i)
      } catch (err) {
        results[i] = {
          inputPath: filePath,
          outputPath: '',
          originalSize: 0,
          processedSize: 0,
          width: 0,
          height: 0,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
      completed++
      const now = Date.now()
      if (completed === files.length || now - lastProgressAt >= PROGRESS_THROTTLE_MS) {
        lastProgressAt = now
        onProgress({ current: completed, total: files.length, currentFile: path.basename(filePath) })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))

  onProgress({ current: files.length, total: files.length, currentFile: '' })
  return results
}

async function processSingleImage(
  filePath: string,
  resize: ResizeOptions,
  output: OutputOptions,
  index: number,
): Promise<ProcessingResult> {
  const originalStats = fs.statSync(filePath)
  // autoOrient bakes the EXIF Orientation into the pixels. Without it every
  // portrait phone or DSLR photo comes out lying on its side, because Sharp
  // neither applies the tag nor copies it to the output.
  let pipeline = sharp(filePath, { animated: true, autoOrient: true })
  const metadata = await sharp(filePath).metadata()

  // ── Resize ──
  // metadata.width/height are the *stored* dimensions and ignore orientation.
  // The pipeline above emits the rotated image, so percentage maths has to
  // scale the rotated size — otherwise a 90°-tagged photo at 50% comes out
  // at 25%, because resize() then fits a portrait image into a landscape box.
  const source = orientedSize(metadata)
  const fitOptions = { fit: resize.fit, withoutEnlargement: resize.noEnlarge }

  if (resize.mode === 'percentage' && resize.percentage !== 100) {
    const w = Math.round(source.width * resize.percentage / 100)
    const h = Math.round(source.height * resize.percentage / 100)
    pipeline = pipeline.resize(w || undefined, h || undefined, fitOptions)
  } else if (resize.mode === 'dimensions') {
    pipeline = pipeline.resize(
      resize.width || undefined,
      resize.height || undefined,
      fitOptions,
    )
  }

  // ── Format & Quality ──
  const sourceFormat = metadata.format ?? 'jpeg'
  const requestedFormat = output.format === 'original' ? sourceFormat : output.format
  const targetFormat: WritableFormat = isWritableFormat(requestedFormat) ? requestedFormat : 'png'
  // Absent/unknown mode falls back to 'max' so older callers keep prior output.
  const mode = output.compression === 'fast' ? 'fast' : 'max'
  const formatOpts: EncoderOptions = { ...FORMAT_OPTIONS[mode][targetFormat] }

  if (USES_QUALITY.has(targetFormat)) {
    formatOpts.quality = output.quality
  } else if (output.palette) {
    // PNG needs to be told to quantise; GIF is always paletted, so for it only
    // the colour count matters.
    if (targetFormat === 'png') formatOpts.palette = true
    formatOpts.colours = output.paletteColours
  }

  // keepIccProfile carries the source colour profile through. Without it a
  // Display P3 photo is written as untagged sRGB and visibly shifts hue.
  pipeline = pipeline.toFormat(targetFormat, formatOpts).keepIccProfile()

  // ── Output Path ──
  const ext = getExtension(targetFormat)
  const outputName = buildOutputName(filePath, output, index)
  const outputPath = path.join(output.outputDir, `${outputName}.${ext}`)

  // Ensure output directory exists
  fs.mkdirSync(output.outputDir, { recursive: true })

  const result = await pipeline.toFile(outputPath)

  return {
    inputPath: filePath,
    outputPath,
    originalSize: originalStats.size,
    processedSize: result.size,
    width: result.width,
    height: result.height,
    success: true,
  }
}

function buildOutputName(filePath: string, output: OutputOptions, index: number): string {
  const base = (output.filenameBase ?? '').trim()

  // Full-rename mode: `{base}_{number}` with zero-padding. Prefix/suffix are ignored.
  if (base !== '') {
    const padding = output.numberPadding > 0 ? output.numberPadding : 3
    const number = String(index + 1).padStart(padding, '0')
    return `${base}_${number}`
  }

  // Default mode: keep original name, decorate with prefix/suffix.
  const original = path.basename(filePath, path.extname(filePath))
  const prefix = output.filenamePrefix ?? ''
  const suffix = output.filenameSuffix ?? '_compressed'
  return `${prefix}${original}${suffix}`
}

/**
 * Dimensions after EXIF Orientation is applied. Sharp exposes these separately
 * because `metadata.width`/`height` always describe the stored pixel buffer,
 * which is transposed from what you see for orientation values 5-8.
 */
function orientedSize(metadata: Metadata): { width: number; height: number } {
  const oriented = metadata.autoOrient as { width?: number; height?: number } | undefined
  return {
    width: oriented?.width ?? metadata.width ?? 0,
    height: oriented?.height ?? metadata.height ?? 0,
  }
}

function getExtension(format: string): string {
  const map: Record<string, string> = {
    jpeg: 'jpg',
    png: 'png',
    webp: 'webp',
    avif: 'avif',
    tiff: 'tiff',
    gif: 'gif',
  }
  return map[format] ?? format
}
