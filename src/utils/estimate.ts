import type { ImageFileInfo, ResizeOptions } from '../types'

/**
 * How many files to actually encode when projecting a batch. Each sample is a
 * real encode at the chosen settings, so this trades accuracy for latency.
 */
export const MAX_SAMPLES = 4

export interface Sample {
  file: ImageFileInfo
  /** Encoded size in bytes, or null when that sample failed to encode. */
  processedSize: number | null
}

export interface Estimate {
  totalOriginal: number
  estimatedTotal: number
  /** Fraction saved; negative when the output is larger than the input. */
  savedRatio: number
  sampled: number
}

/**
 * Pixels the file will occupy after resizing.
 *
 * The projection is driven by output pixels rather than input bytes because
 * that is what the encoder actually charges for. Scaling a batch by an
 * input-byte ratio is badly wrong whenever resizing is involved: a 4032px photo
 * and a 640px one both land at 1280px, yet their inputs differ by 30x.
 */
export function projectedOutputPixels(file: ImageFileInfo, resize: ResizeOptions): number {
  const { width, height } = file
  if (width <= 0 || height <= 0) return 0

  if (resize.mode === 'none') return width * height

  if (resize.mode === 'percentage') {
    const scale = resize.noEnlarge
      ? Math.min(1, resize.percentage / 100)
      : resize.percentage / 100
    return Math.round(width * scale) * Math.round(height * scale)
  }

  // An empty box dimension means "unconstrained on that axis".
  const targetW = resize.width > 0 ? resize.width : Infinity
  const targetH = resize.height > 0 ? resize.height : Infinity
  if (!Number.isFinite(targetW) && !Number.isFinite(targetH)) return width * height

  const ratioW = targetW / width
  const ratioH = targetH / height

  // 'cover', 'fill' and 'contain' all emit the box itself when both axes are
  // given; the difference between them is cropping or padding, not pixel count.
  const fillsBox = resize.fit === 'cover' || resize.fit === 'fill' || resize.fit === 'contain'
  if (fillsBox && Number.isFinite(targetW) && Number.isFinite(targetH)) {
    // withoutEnlargement only bites when the source is too small to fill the
    // box, and 'contain' is exempt because its padding fills the box anyway.
    // Measured against Sharp: a 100x100 source into a 500x500 box yields
    // 100x100 for cover/fill and 500x500 for contain.
    const tooSmall = resize.noEnlarge && Math.max(ratioW, ratioH) > 1
    if (tooSmall && resize.fit !== 'contain') return width * height
    return targetW * targetH
  }

  // 'inside' fits within the box, 'outside' covers it.
  const raw = resize.fit === 'outside'
    ? Math.max(Number.isFinite(ratioW) ? ratioW : 0, Number.isFinite(ratioH) ? ratioH : 0)
    : Math.min(ratioW, ratioH)
  const scale = resize.noEnlarge ? Math.min(1, raw) : raw
  return Math.round(width * scale) * Math.round(height * scale)
}

/**
 * Chooses which files to encode.
 *
 * Stratified by source format first, then spread across the size range within
 * each format. Bytes per pixel differs enormously between a PNG and a JPEG, so
 * a sample set drawn only from one of them projects the other completely wrong
 * — especially with the default 'original' output format, where each file keeps
 * its own encoder.
 */
export function pickSamples(files: ImageFileInfo[], count = MAX_SAMPLES): ImageFileInfo[] {
  if (files.length <= count) return [...files]

  const byFormat = new Map<string, ImageFileInfo[]>()
  for (const file of files) {
    const group = byFormat.get(file.format)
    if (group) group.push(file)
    else byFormat.set(file.format, [file])
  }

  // Largest groups first, so with fewer slots than formats the dominant ones win.
  const groups = [...byFormat.values()].sort((a, b) => b.length - a.length)
  const picked: ImageFileInfo[] = []

  for (let i = 0; i < groups.length && picked.length < count; i++) {
    const remainingSlots = count - picked.length
    const remainingGroups = groups.length - i
    const share = Math.max(1, Math.min(remainingSlots - remainingGroups + 1, Math.round(count * groups[i].length / files.length)))
    picked.push(...spread(groups[i], Math.min(share, remainingSlots)))
  }

  return picked
}

/** Evenly spaced quantiles of a group sorted by size. */
function spread(group: ImageFileInfo[], count: number): ImageFileInfo[] {
  const sorted = [...group].sort((a, b) => a.size - b.size)
  if (sorted.length <= count) return sorted

  const out: ImageFileInfo[] = []
  for (let i = 0; i < count; i++) {
    const position = (2 * i + 1) / (2 * count)
    out.push(sorted[Math.min(sorted.length - 1, Math.floor(position * sorted.length))])
  }
  return out
}

/**
 * Projects the batch from the encoded samples.
 *
 * Bytes per output pixel is pooled per source format, because that is the axis
 * along which encoders differ most. A format with no successful sample falls
 * back to the overall rate rather than being dropped — leaving files out would
 * understate the total.
 */
export function projectEstimate(
  files: ImageFileInfo[],
  resize: ResizeOptions,
  samples: Sample[],
): Estimate | null {
  const usable = samples.filter((s) => s.processedSize !== null && s.processedSize >= 0)
  if (usable.length === 0 || files.length === 0) return null

  const totalOriginal = files.reduce((sum, f) => sum + f.size, 0)
  if (totalOriginal <= 0) return null

  const rateByFormat = new Map<string, { bytes: number; pixels: number }>()
  let pooledBytes = 0
  let pooledPixels = 0

  for (const { file, processedSize } of usable) {
    const pixels = projectedOutputPixels(file, resize)
    if (pixels <= 0) continue
    const entry = rateByFormat.get(file.format) ?? { bytes: 0, pixels: 0 }
    entry.bytes += processedSize as number
    entry.pixels += pixels
    rateByFormat.set(file.format, entry)
    pooledBytes += processedSize as number
    pooledPixels += pixels
  }

  if (pooledPixels <= 0) return null
  const pooledRate = pooledBytes / pooledPixels

  let estimatedTotal = 0
  for (const file of files) {
    const pixels = projectedOutputPixels(file, resize)
    const group = rateByFormat.get(file.format)
    const rate = group && group.pixels > 0 ? group.bytes / group.pixels : pooledRate
    estimatedTotal += pixels * rate
  }

  estimatedTotal = Math.round(estimatedTotal)
  return {
    totalOriginal,
    estimatedTotal,
    savedRatio: 1 - estimatedTotal / totalOriginal,
    sampled: usable.length,
  }
}
