import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expandPaths, isSupportedFile } from './fileScan'

const EXTENSIONS = ['jpg', 'png', 'svg.gz']
let root: string

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'filescan-'))
  await fs.mkdir(path.join(root, 'nested', 'deep'), { recursive: true })
  await fs.mkdir(path.join(root, '.hidden'), { recursive: true })
  const write = (p: string) => fs.writeFile(path.join(root, p), 'x')
  await Promise.all([
    write('b.jpg'), write('a.png'), write('notes.txt'), write('archive.svg.gz'),
    write('nested/c.jpg'), write('nested/deep/d.png'), write('nested/readme.md'),
    write('.hidden/secret.jpg'),
  ])
})

afterAll(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('isSupportedFile', () => {
  it('matches by full suffix so compound extensions work', () => {
    expect(isSupportedFile('/x/archive.svg.gz', EXTENSIONS)).toBe(true)
    // `split('.').pop()` would see "gz" here and wrongly accept it.
    expect(isSupportedFile('/x/backup.tar.gz', EXTENSIONS)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isSupportedFile('/x/PHOTO.JPG', EXTENSIONS)).toBe(true)
  })

  it('rejects unsupported extensions', () => {
    expect(isSupportedFile('/x/notes.txt', EXTENSIONS)).toBe(false)
  })
})

describe('expandPaths', () => {
  it('walks a directory and keeps only readable images', async () => {
    const found = await expandPaths([root], EXTENSIONS)
    expect(found.map((p) => path.relative(root, p))).toEqual([
      'a.png', 'archive.svg.gz', 'b.jpg',
      path.join('nested', 'c.jpg'),
      path.join('nested', 'deep', 'd.png'),
    ])
  })

  it('returns a stable order so rename numbering is reproducible', async () => {
    const a = await expandPaths([root], EXTENSIONS)
    const b = await expandPaths([root], EXTENSIONS)
    expect(a).toEqual(b)
  })

  it('skips dot-directories', async () => {
    const found = await expandPaths([root], EXTENSIONS)
    expect(found.some((p) => p.includes('.hidden'))).toBe(false)
  })

  it('accepts files directly and de-duplicates against a walked directory', async () => {
    const found = await expandPaths([path.join(root, 'b.jpg'), root], EXTENSIONS)
    expect(found.filter((p) => p.endsWith('b.jpg'))).toHaveLength(1)
  })

  it('ignores paths that do not exist instead of failing the batch', async () => {
    const found = await expandPaths([path.join(root, 'gone'), path.join(root, 'b.jpg')], EXTENSIONS)
    expect(found).toEqual([path.join(root, 'b.jpg')])
  })

  it('returns nothing for an empty input', async () => {
    expect(await expandPaths([], EXTENSIONS)).toEqual([])
  })
})
