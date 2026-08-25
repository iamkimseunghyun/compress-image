import { describe, expect, it } from 'vitest'
import type { ImageFileInfo, ResizeOptions } from '../types'
import { pickSamples, projectEstimate, projectedOutputPixels } from './estimate'

const file = (name: string, size: number, w = 1000, h = 1000, format = 'jpeg'): ImageFileInfo =>
  ({ path: `/in/${name}`, name, size, width: w, height: h, format })

const resize = (o: Partial<ResizeOptions> = {}): ResizeOptions =>
  ({ mode: 'none', percentage: 100, width: 0, height: 0, fit: 'inside', noEnlarge: true, ...o })

describe('projectedOutputPixels', () => {
  it('keeps the source size when not resizing', () => {
    expect(projectedOutputPixels(file('a', 1, 800, 600), resize())).toBe(800 * 600)
  })

  it('scales by percentage', () => {
    expect(projectedOutputPixels(file('a', 1, 800, 600), resize({ mode: 'percentage', percentage: 50 })))
      .toBe(400 * 300)
  })

  it('fits inside the box on the tighter axis', () => {
    // 4000x3000 into 1280x1280 is bound by width: 1280x960.
    expect(projectedOutputPixels(file('a', 1, 4000, 3000), resize({ mode: 'dimensions', width: 1280, height: 1280 })))
      .toBe(1280 * 960)
  })

  it('does not enlarge when asked not to', () => {
    const small = file('a', 1, 400, 300)
    const opts = { mode: 'dimensions' as const, width: 4000, height: 4000 }
    expect(projectedOutputPixels(small, resize({ ...opts, noEnlarge: true }))).toBe(400 * 300)
    expect(projectedOutputPixels(small, resize({ ...opts, noEnlarge: false }))).toBe(4000 * 3000)
  })

  it('emits the box itself for cover, fill and contain', () => {
    for (const fit of ['cover', 'fill', 'contain'] as const) {
      expect(projectedOutputPixels(file('a', 1, 4000, 3000), resize({ mode: 'dimensions', width: 800, height: 800, fit })))
        .toBe(800 * 800)
    }
  })

  it('applies withoutEnlargement to cover and fill but not contain', () => {
    // Measured against Sharp: a 100x100 source into a 500x500 box yields
    // 100x100 for cover/fill and 500x500 for contain, because contain pads.
    const small = file('a', 1, 100, 100)
    const box = { mode: 'dimensions' as const, width: 500, height: 500, noEnlarge: true }
    expect(projectedOutputPixels(small, resize({ ...box, fit: 'cover' }))).toBe(100 * 100)
    expect(projectedOutputPixels(small, resize({ ...box, fit: 'fill' }))).toBe(100 * 100)
    expect(projectedOutputPixels(small, resize({ ...box, fit: 'contain' }))).toBe(500 * 500)
  })

  it('covers the box for outside', () => {
    // 4000x3000 covering 1280x1280 is bound by height: 1707x1280.
    const px = projectedOutputPixels(file('a', 1, 4000, 3000), resize({ mode: 'dimensions', width: 1280, height: 1280, fit: 'outside', noEnlarge: false }))
    expect(px).toBe(Math.round(4000 * (1280 / 3000)) * 1280)
  })

  it('treats a zero dimension as unconstrained', () => {
    expect(projectedOutputPixels(file('a', 1, 4000, 3000), resize({ mode: 'dimensions', width: 1000, height: 0 })))
      .toBe(1000 * 750)
    expect(projectedOutputPixels(file('a', 1, 4000, 3000), resize({ mode: 'dimensions', width: 0, height: 0 })))
      .toBe(4000 * 3000)
  })

  it('returns zero for unknown dimensions', () => {
    expect(projectedOutputPixels(file('a', 1, 0, 0), resize())).toBe(0)
  })
})

describe('pickSamples', () => {
  it('returns everything for a small batch', () => {
    const files = [file('a', 10), file('b', 20)]
    expect(pickSamples(files)).toEqual(files)
  })

  it('covers every source format present', () => {
    // 12 JPEGs and 2 PNGs: a size-only sampler would likely miss PNG entirely,
    // and PNG bytes-per-pixel is nothing like JPEG's.
    const files = [
      ...Array.from({ length: 12 }, (_, i) => file(`j${i}`, 1000 + i, 1000, 1000, 'jpeg')),
      file('p0', 50_000, 1000, 1000, 'png'),
      file('p1', 60_000, 1000, 1000, 'png'),
    ]
    const formats = new Set(pickSamples(files, 4).map((f) => f.format))
    expect(formats).toEqual(new Set(['jpeg', 'png']))
  })

  it('never exceeds the requested count', () => {
    const files = Array.from({ length: 40 }, (_, i) => file(`f${i}`, i + 1, 1000, 1000, `fmt${i % 6}`))
    expect(pickSamples(files, 4).length).toBeLessThanOrEqual(4)
  })

  it('spreads across the size range within a format', () => {
    const files = Array.from({ length: 20 }, (_, i) => file(`f${i}`, (i + 1) * 100))
    const sizes = pickSamples(files, 2).map((f) => f.size)
    expect(sizes[0]).toBeLessThan(sizes[1])
  })

  it('handles an empty batch', () => {
    expect(pickSamples([], 3)).toEqual([])
  })
})

describe('projectEstimate', () => {
  it('scales by bytes per output pixel, not by input bytes', () => {
    // Both files render to the same output size, so they must contribute
    // equally even though their inputs differ 10x.
    const big = file('big', 10_000_000, 4000, 3000)
    const small = file('small', 1_000_000, 4000, 3000)
    const r = resize({ mode: 'dimensions', width: 1000, height: 1000 })
    const est = projectEstimate([big, small], r, [{ file: big, processedSize: 100_000 }])
    // 1000x750 = 750k pixels each; sample rate = 100000/750000.
    expect(est!.estimatedTotal).toBe(200_000)
  })

  it('uses a separate rate per source format', () => {
    const jpg = file('a', 1_000_000, 1000, 1000, 'jpeg')
    const png = file('b', 1_000_000, 1000, 1000, 'png')
    const est = projectEstimate([jpg, png], resize(), [
      { file: jpg, processedSize: 100_000 },
      { file: png, processedSize: 900_000 },
    ])
    expect(est!.estimatedTotal).toBe(1_000_000)
  })

  it('falls back to the pooled rate for an unsampled format', () => {
    const jpg = file('a', 1_000_000, 1000, 1000, 'jpeg')
    const tif = file('b', 1_000_000, 1000, 1000, 'tiff')
    const est = projectEstimate([jpg, tif], resize(), [{ file: jpg, processedSize: 200_000 }])
    expect(est!.estimatedTotal).toBe(400_000)
  })

  it('ignores samples that failed to encode', () => {
    const a = file('a', 1_000_000, 1000, 1000)
    const b = file('b', 1_000_000, 1000, 1000)
    const est = projectEstimate([a, b], resize(), [
      { file: a, processedSize: null },
      { file: b, processedSize: 500_000 },
    ])
    expect(est).toMatchObject({ estimatedTotal: 1_000_000, sampled: 1 })
  })

  it('reports growth as a negative saving', () => {
    const a = file('a', 100, 10, 10)
    const est = projectEstimate([a], resize(), [{ file: a, processedSize: 150 }])
    expect(est!.savedRatio).toBeCloseTo(-0.5)
  })

  it('returns null rather than fabricating a number', () => {
    const a = file('a', 1000, 100, 100)
    expect(projectEstimate([], resize(), [{ file: a, processedSize: 10 }])).toBeNull()
    expect(projectEstimate([a], resize(), [])).toBeNull()
    expect(projectEstimate([a], resize(), [{ file: a, processedSize: null }])).toBeNull()
    expect(projectEstimate([file('z', 0, 100, 100)], resize(), [{ file: a, processedSize: 10 }])).toBeNull()
  })
})
