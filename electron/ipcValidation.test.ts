import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_DIMENSION, MAX_FILES, parseProcessRequest } from './ipcValidation'

const OUT = path.resolve('/tmp/out')
const valid = (overrides: Record<string, unknown> = {}) => ({
  files: ['/in/a.jpg'],
  resize: { mode: 'percentage', percentage: 50, width: 1920, height: 1080, fit: 'inside', noEnlarge: true },
  output: {
    format: 'webp', quality: 75, compression: 'fast', palette: false, paletteColours: 256,
    onConflict: 'number', outputDir: OUT, filenameBase: '', numberPadding: 3,
    filenamePrefix: '', filenameSuffix: '_out',
  },
  ...overrides,
})

describe('parseProcessRequest — refuses what has no safe default', () => {
  it('rejects a missing output directory', () => {
    const args = valid()
    args.output.outputDir = ''
    expect(() => parseProcessRequest(args)).toThrow(/출력 폴더가 지정되지/)
  })

  it('rejects a relative output directory', () => {
    // Relative paths resolve against the app's working directory, which is
    // wherever it happened to be launched from.
    const args = valid()
    args.output.outputDir = 'out'
    expect(() => parseProcessRequest(args)).toThrow(/절대 경로/)
  })

  it('rejects a non-array file list', () => {
    expect(() => parseProcessRequest(valid({ files: 'a.jpg' }))).toThrow(/파일 목록/)
  })

  it('rejects an empty file list', () => {
    expect(() => parseProcessRequest(valid({ files: [] }))).toThrow(/파일이 없습니다/)
    expect(() => parseProcessRequest(valid({ files: [null, 42, ''] }))).toThrow(/파일이 없습니다/)
  })

  it('rejects more files than the batch limit', () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => `/in/${i}.jpg`)
    expect(() => parseProcessRequest(valid({ files }))).toThrow(/10000개까지/)
  })

  it('rejects a completely malformed payload', () => {
    for (const input of [null, undefined, 'nope', 42]) {
      expect(() => parseProcessRequest(input)).toThrow()
    }
  })
})

describe('parseProcessRequest — clamps what has one', () => {
  it('keeps a well-formed request intact', () => {
    const parsed = parseProcessRequest(valid())
    expect(parsed.files).toEqual(['/in/a.jpg'])
    expect(parsed.output.format).toBe('webp')
    expect(parsed.output.quality).toBe(75)
    expect(parsed.resize.percentage).toBe(50)
  })

  it('drops non-string entries from the file list', () => {
    const parsed = parseProcessRequest(valid({ files: ['/in/a.jpg', null, 7, '/in/b.jpg', ''] }))
    expect(parsed.files).toEqual(['/in/a.jpg', '/in/b.jpg'])
  })

  it('caps dimensions so a huge request cannot exhaust memory', () => {
    const args = valid()
    args.resize.width = 10_000_000
    args.resize.height = -5
    const parsed = parseProcessRequest(args)
    expect(parsed.resize.width).toBe(MAX_DIMENSION)
    expect(parsed.resize.height).toBe(0)
  })

  it('clamps quality and palette size into range', () => {
    const args = valid()
    args.output.quality = 999
    args.output.paletteColours = 1
    const parsed = parseProcessRequest(args)
    expect(parsed.output.quality).toBe(100)
    expect(parsed.output.paletteColours).toBe(2)
  })

  it('falls back on unknown enum values rather than passing them to Sharp', () => {
    const args = valid()
    args.output.format = 'bmp'
    args.resize.fit = 'squish'
    args.output.onConflict = 'explode'
    const parsed = parseProcessRequest(args)
    expect(parsed.output.format).toBe('original')
    expect(parsed.resize.fit).toBe('inside')
    expect(parsed.output.onConflict).toBe('number')
  })

  it('fills in missing option objects entirely', () => {
    const parsed = parseProcessRequest({ files: ['/in/a.jpg'], output: { outputDir: OUT } })
    expect(parsed.resize.mode).toBe('none')
    expect(parsed.output.quality).toBe(80)
    expect(parsed.output.filenameSuffix).toBe('_compressed')
  })

  it('rejects NaN rather than letting it through as a dimension', () => {
    const args = valid()
    args.resize.width = NaN
    expect(parseProcessRequest(args).resize.width).toBe(0)
  })
})
