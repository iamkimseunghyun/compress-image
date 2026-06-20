import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import type { ResizeOptions, OutputOptions, ProcessingResult, ProcessingProgress, ImageFileInfo } from '../src/types'

const FORMAT_OPTIONS: Record<string, object> = {
  jpeg: { mozjpeg: true },
  png: { compressionLevel: 9 },
  webp: {},
  avif: {},
  tiff: {},
  gif: {},
}

// Formats Sharp can encode. Sources outside this set (e.g. svg, heif) can be
// read but not always re-encoded, so 'original' falls back to png for them.
const WRITABLE_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'])

// Cap parallelism so very large batches don't spike memory while still using
// multiple cores. libvips parallelizes each op internally; this adds file-level
// concurrency on top.
const MAX_CONCURRENCY = 8

export async function getImageInfo(filePath: string): Promise<ImageFileInfo> {
  const metadata = await sharp(filePath).metadata()
  const stats = fs.statSync(filePath)

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
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
  const concurrency = Math.max(1, Math.min(files.length, os.cpus().length, MAX_CONCURRENCY))
  let nextIndex = 0
  let completed = 0

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
      onProgress({ current: completed, total: files.length, currentFile: path.basename(filePath) })
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
  let pipeline = sharp(filePath, { animated: true })
  const metadata = await sharp(filePath).metadata()

  // ── Resize ──
  if (resize.mode === 'percentage' && resize.percentage !== 100) {
    const w = Math.round((metadata.width ?? 0) * resize.percentage / 100)
    const h = Math.round((metadata.height ?? 0) * resize.percentage / 100)
    pipeline = pipeline.resize(w || undefined, h || undefined, { fit: resize.fit })
  } else if (resize.mode === 'dimensions') {
    pipeline = pipeline.resize(
      resize.width || undefined,
      resize.height || undefined,
      { fit: resize.fit },
    )
  }

  // ── Format & Quality ──
  const sourceFormat = metadata.format ?? 'jpeg'
  const requestedFormat = output.format === 'original' ? sourceFormat : output.format
  const targetFormat = WRITABLE_FORMATS.has(requestedFormat) ? requestedFormat : 'png'
  const formatOpts = { ...FORMAT_OPTIONS[targetFormat], quality: output.quality }

  pipeline = pipeline.toFormat(targetFormat as keyof sharp.FormatEnum, formatOpts)

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
