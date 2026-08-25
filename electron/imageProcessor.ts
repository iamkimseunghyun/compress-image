import sharp from 'sharp'
import type {
  AvifOptions, GifOptions, JpegOptions, Metadata, PngOptions, Sharp, TiffOptions, WebpOptions,
} from 'sharp'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import type { ResizeOptions, OutputOptions, ProcessingResult, ProcessingProgress, ImageFileInfo } from '../src/types'
import { buildOutputName, createOutputPathReserver, getExtension, type ReserveOutputPath } from './outputPath'

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

/** Edge length of the preview shown in the file list. */
const THUMBNAIL_PX = 96

/**
 * Ceiling on a single image. A truncated or adversarially crafted file can send
 * libvips into work that never finishes, which would pin one of the eight
 * workers for the rest of the batch.
 */
const PER_IMAGE_TIMEOUT_S = 120

// Input formats the app means to accept. The actual extension list is derived
// from what this build of Sharp reports as readable, so it can never advertise
// something that fails on open: the prebuilt binaries carry no HEVC decoder, so
// `heif` contributes only `.avif` and .heic/.heif correctly drop out.
// AVIF has no entry of its own — libvips reads it through `heif`, which is also
// why .heic/.heif drop out: this build's libheif carries no HEVC decoder, so
// `heif` reports `.avif` as its only readable suffix.
const INTENDED_INPUT_FORMATS = ['jpeg', 'png', 'webp', 'tiff', 'gif', 'svg', 'heif'] as const

export function getSupportedExtensions(): string[] {
  const suffixes = INTENDED_INPUT_FORMATS.flatMap((name) => {
    const format = sharp.format[name]
    return format?.input?.file ? format.input.fileSuffix ?? [] : []
  })
  return [...new Set(suffixes.map((s) => s.replace(/^\./, '').toLowerCase()))].sort()
}

export async function getImageInfo(filePath: string): Promise<ImageFileInfo> {
  const metadata = await sharp(filePath).metadata()
  const stats = await fs.stat(filePath)

  // Report post-rotation dimensions so the list matches what gets written.
  const oriented = orientedSize(metadata)

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    width: oriented.width,
    height: oriented.height,
    format: metadata.format ?? 'unknown',
    thumbnail: await renderThumbnail(filePath, metadata.format),
  }
}

/**
 * A small preview for the file list, inlined as a data URI so the renderer needs
 * no filesystem access. Failure is not worth surfacing — the list simply shows
 * no image — so a broken thumbnail never blocks adding a valid file.
 */
async function renderThumbnail(filePath: string, format: string | undefined): Promise<string | undefined> {
  try {
    const buffer = await sharp(filePath, {
      autoOrient: true,
      // Only useful here. libvips rasterises an SVG at its declared size, and
      // withoutEnlargement then refuses to scale it up, so a 32px icon would
      // yield a 32px thumbnail in a 96px box; doubling the density gives 64px.
      // The main pipeline needs no equivalent — Sharp re-renders the vector at
      // the resize target, so its output is already sharp at any size.
      density: format === 'svg' ? 144 : undefined,
    })
      .resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 60 })
      .timeout({ seconds: 10 })
      .toBuffer()
    return `data:image/webp;base64,${buffer.toString('base64')}`
  } catch {
    return undefined
  }
}

export async function processImages(
  files: string[],
  resize: ResizeOptions,
  output: OutputOptions,
  onProgress: (progress: ProcessingProgress) => void,
  shouldCancel: () => boolean = () => false,
): Promise<ProcessingResult[]> {
  // Preserve input order in results; each file keeps its original index so the
  // rename auto-numbering stays deterministic regardless of completion order.
  const results: ProcessingResult[] = new Array(files.length)
  // One reserver per batch so concurrent workers can never be handed the same
  // write target. Created up front because it is shared mutable state.
  const reserveOutputPath = createOutputPathReserver(output.outputDir, output.onConflict)
  // os.cpus() can return an empty array in some restricted environments.
  const cpuCount = os.cpus()?.length || 1
  const concurrency = Math.max(1, Math.min(files.length, cpuCount, MAX_CONCURRENCY))
  let nextIndex = 0
  let completed = 0
  // Throttle progress so concurrent completions don't flood the IPC channel.
  let lastProgressAt = 0
  const PROGRESS_THROTTLE_MS = 100

  // Once per batch rather than once per image, and before any worker starts, so
  // an unwritable folder fails here instead of repeating on every single file.
  await fs.mkdir(output.outputDir, { recursive: true })

  onProgress({ current: 0, total: files.length, currentFile: '' })

  async function worker(): Promise<void> {
    while (true) {
      // Checked before claiming an index so a cancelled batch stops at the next
      // file boundary; the encode already in flight is allowed to finish.
      if (shouldCancel()) return
      const i = nextIndex++
      if (i >= files.length) return

      const filePath = files[i]
      try {
        results[i] = await processSingleImage(filePath, resize, output, i, reserveOutputPath)
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

  // A cancelled batch leaves holes in the pre-sized array; filter() skips them.
  const processed = results.filter((r): r is ProcessingResult => r !== undefined)
  onProgress({ current: processed.length, total: files.length, currentFile: '' })
  return processed
}

/**
 * Builds the encode pipeline for one file, short of writing it anywhere.
 *
 * Shared with the size estimate on purpose: an estimate produced by a separate
 * copy of this logic would drift out of agreement with the real run the first
 * time either side changed.
 */
async function buildPipeline(
  filePath: string,
  resize: ResizeOptions,
  output: OutputOptions,
): Promise<{ pipeline: Sharp; targetFormat: WritableFormat }> {
  // autoOrient bakes the EXIF Orientation into the pixels. Without it every
  // portrait phone or DSLR photo comes out lying on its side, because Sharp
  // neither applies the tag nor copies it to the output.
  let pipeline = sharp(filePath, { animated: true, autoOrient: true })
  // Deliberately a second, non-animated instance. For an animated image the
  // animated instance reports the whole frame strip (a 3-frame 100x50 GIF reads
  // as 100x150), while this one reports a single frame. The percentage maths
  // below needs per-frame dimensions: with fit 'inside' the strip height happens
  // to give the same answer, but with 'fill', 'cover' or 'contain' it stretches
  // every frame. The extra header parse is ~1-2ms against ~90ms of encoding.
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
  pipeline = pipeline.toFormat(targetFormat, formatOpts).keepIccProfile().timeout({ seconds: PER_IMAGE_TIMEOUT_S })

  return { pipeline, targetFormat }
}

async function processSingleImage(
  filePath: string,
  resize: ResizeOptions,
  output: OutputOptions,
  index: number,
  reserveOutputPath: ReserveOutputPath,
): Promise<ProcessingResult> {
  const originalStats = await fs.stat(filePath)
  const { pipeline, targetFormat } = await buildPipeline(filePath, resize, output)

  // ── Output Path ──
  // Reserved synchronously, before any await, so two workers producing the same
  // name cannot be handed the same path and race on the write.
  const outputPath = reserveOutputPath(buildOutputName(filePath, output, index), getExtension(targetFormat))

  if (outputPath === null) {
    return {
      inputPath: filePath,
      outputPath: '',
      originalSize: originalStats.size,
      processedSize: 0,
      width: 0,
      height: 0,
      success: false,
      skipped: true,
    }
  }

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

/**
 * Encodes the given files at the current settings without writing anything, so
 * the UI can project what the batch will produce before the user commits to it.
 * A file that fails to encode reports null rather than failing the whole probe —
 * one unreadable sample should not remove the estimate for the rest.
 */
export async function estimateSizes(
  files: string[],
  resize: ResizeOptions,
  output: OutputOptions,
): Promise<(number | null)[]> {
  return Promise.all(files.map(async (filePath) => {
    try {
      const { pipeline } = await buildPipeline(filePath, resize, output)
      const buffer = await pipeline.toBuffer()
      return buffer.length
    } catch {
      return null
    }
  }))
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

