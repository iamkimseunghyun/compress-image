import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'
import type { ResizeOptions, OutputOptions, ProcessingResult, ProcessingProgress, ImageFileInfo } from '../src/types'

const FORMAT_OPTIONS: Record<string, object> = {
  jpeg: { mozjpeg: true },
  png: { compressionLevel: 9 },
  webp: {},
  avif: {},
  tiff: {},
  gif: {},
}

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
  const results: ProcessingResult[] = []

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    onProgress({ current: i, total: files.length, currentFile: path.basename(filePath) })

    try {
      const result = await processSingleImage(filePath, resize, output, i)
      results.push(result)
    } catch (err) {
      results.push({
        inputPath: filePath,
        outputPath: '',
        originalSize: 0,
        processedSize: 0,
        width: 0,
        height: 0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

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
  const targetFormat = output.format === 'original' ? sourceFormat : output.format
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
