import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { OutputOptions } from '../src/types'
import {
  buildOutputName,
  createOutputPathReserver,
  getExtension,
  sanitizeSegment,
} from './outputPath'

const options = (overrides: Partial<OutputOptions> = {}): OutputOptions => ({
  format: 'original',
  quality: 80,
  compression: 'max',
  palette: false,
  paletteColours: 256,
  onConflict: 'number',
  outputDir: '/out',
  filenameBase: '',
  numberPadding: 3,
  filenamePrefix: '',
  filenameSuffix: '_compressed',
  ...overrides,
})

/** Reserver backed by a fixed set of "existing" files instead of the real disk. */
const reserverWith = (existing: string[], policy: OutputOptions['onConflict'] = 'number') => {
  const present = new Set(existing.map((p) => path.resolve('/out', p)))
  return createOutputPathReserver('/out', policy, (p) => present.has(p))
}

describe('sanitizeSegment', () => {
  it('replaces path separators so a name cannot become a directory', () => {
    expect(sanitizeSegment('a/b')).toBe('a_b')
    expect(sanitizeSegment('a\\b')).toBe('a_b')
  })

  it('replaces the characters Windows rejects in a filename', () => {
    expect(sanitizeSegment('a:b*c?d"e<f>g|h')).toBe('a_b_c_d_e_f_g_h')
  })

  it('replaces control characters', () => {
    expect(sanitizeSegment(`tab\there`)).toBe('tab_here')
    expect(sanitizeSegment(String.fromCharCode(0) + 'x')).toBe('_x')
  })

  it('leaves ordinary names alone', () => {
    expect(sanitizeSegment('사진 01-final.v2')).toBe('사진 01-final.v2')
  })
})

describe('buildOutputName', () => {
  it('keeps the original name with prefix and suffix', () => {
    expect(buildOutputName('/in/photo.jpg', options({ filenamePrefix: 'web_' }), 0))
      .toBe('web_photo_compressed')
  })

  it('renames with a zero-padded sequence and ignores prefix/suffix', () => {
    const o = options({ filenameBase: 'shot', numberPadding: 4, filenamePrefix: 'x', filenameSuffix: 'y' })
    expect(buildOutputName('/in/photo.jpg', o, 0)).toBe('shot_0001')
    expect(buildOutputName('/in/photo.jpg', o, 41)).toBe('shot_0042')
  })

  it('falls back to a padding of 3 when none is set', () => {
    expect(buildOutputName('/in/a.jpg', options({ filenameBase: 'p', numberPadding: 0 }), 0)).toBe('p_001')
  })

  it('strips traversal out of the rename base', () => {
    const name = buildOutputName('/in/a.jpg', options({ filenameBase: '../../evil' }), 0)
    expect(name).toBe('.._.._evil_001')
    expect(name).not.toContain('/')
  })

  it('strips traversal out of prefix and suffix', () => {
    const name = buildOutputName('/in/a.jpg', options({ filenamePrefix: '../', filenameSuffix: '/..' }), 0)
    expect(name).not.toContain('/')
  })

  it('drops trailing dots and spaces that Windows would silently strip', () => {
    expect(buildOutputName('/in/a.jpg', options({ filenameSuffix: '. ' }), 0)).toBe('a')
  })

  it('falls back to a usable name when everything sanitises away', () => {
    expect(buildOutputName('/in/...jpg', options({ filenameSuffix: '' }), 0)).toBe('image')
  })
})

describe('getExtension', () => {
  it('maps jpeg to the conventional jpg', () => {
    expect(getExtension('jpeg')).toBe('jpg')
  })

  it('passes through formats that need no mapping', () => {
    expect(getExtension('webp')).toBe('webp')
    expect(getExtension('unknown')).toBe('unknown')
  })
})

describe('createOutputPathReserver', () => {
  it('gives same-named inputs distinct paths instead of overwriting', () => {
    const reserve = reserverWith([])
    expect(reserve('photo', 'jpg')).toBe(path.resolve('/out/photo.jpg'))
    expect(reserve('photo', 'jpg')).toBe(path.resolve('/out/photo-1.jpg'))
    expect(reserve('photo', 'jpg')).toBe(path.resolve('/out/photo-2.jpg'))
  })

  it("does not collide with files already on disk under 'number'", () => {
    const reserve = reserverWith(['photo.jpg', 'photo-1.jpg'])
    expect(reserve('photo', 'jpg')).toBe(path.resolve('/out/photo-2.jpg'))
  })

  it("reuses an existing path under 'overwrite'", () => {
    const reserve = reserverWith(['photo.jpg'], 'overwrite')
    expect(reserve('photo', 'jpg')).toBe(path.resolve('/out/photo.jpg'))
  })

  it("still separates within-batch collisions under 'overwrite'", () => {
    // Overwriting an earlier run is the user's choice; destroying a file this
    // same run just produced is the bug this reserver exists to prevent.
    const reserve = reserverWith(['photo.jpg'], 'overwrite')
    expect(reserve('photo', 'jpg')).toBe(path.resolve('/out/photo.jpg'))
    expect(reserve('photo', 'jpg')).toBe(path.resolve('/out/photo-1.jpg'))
  })

  it("returns null for an existing file under 'skip'", () => {
    const reserve = reserverWith(['photo.jpg'], 'skip')
    expect(reserve('photo', 'jpg')).toBeNull()
    expect(reserve('other', 'jpg')).toBe(path.resolve('/out/other.jpg'))
  })

  it('keeps different extensions apart', () => {
    const reserve = reserverWith([])
    expect(reserve('photo', 'jpg')).toBe(path.resolve('/out/photo.jpg'))
    expect(reserve('photo', 'webp')).toBe(path.resolve('/out/photo.webp'))
  })

  it('allows a leading ".." in a legitimate filename', () => {
    // `path.relative` returns "..backup.jpg" here, which a naive startsWith('..')
    // containment check would reject even though it stays inside the folder.
    const reserve = reserverWith([])
    expect(reserve('..backup', 'jpg')).toBe(path.resolve('/out/..backup.jpg'))
  })

  it('rejects a name that would escape the output folder', () => {
    const reserve = reserverWith([])
    expect(() => reserve(`..${path.sep}escaped`, 'jpg')).toThrow(/벗어납니다/)
  })
})
