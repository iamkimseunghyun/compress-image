import path from 'node:path'
import fs from 'node:fs'
import type { OutputOptions } from '../src/types'

/** Path separators, the characters Windows forbids in a name, and control codes. */
const ILLEGAL_CHARS = /[\\/:*?"<>|]|\p{Cc}/gu

/**
 * Make a user-supplied string safe to use inside a single path segment.
 * The rename base, prefix and suffix flow straight into the output path, so
 * without this a base of `../out` writes outside the chosen folder and a `:`
 * fails the write outright on Windows.
 */
export function sanitizeSegment(value: string): string {
  return value.replace(ILLEGAL_CHARS, '_')
}

const EXTENSIONS: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  tiff: 'tiff',
  gif: 'gif',
}

export function getExtension(format: string): string {
  return EXTENSIONS[format] ?? format
}

export function buildOutputName(filePath: string, output: OutputOptions, index: number): string {
  const base = sanitizeSegment((output.filenameBase ?? '').trim())

  // Full-rename mode: `{base}_{number}` with zero-padding. Prefix/suffix are ignored.
  if (base !== '') {
    const padding = output.numberPadding > 0 ? output.numberPadding : 3
    const number = String(index + 1).padStart(padding, '0')
    return finalise(`${base}_${number}`)
  }

  // Default mode: keep original name, decorate with prefix/suffix.
  const original = sanitizeSegment(path.basename(filePath, path.extname(filePath)))
  const prefix = sanitizeSegment(output.filenamePrefix ?? '')
  const suffix = sanitizeSegment(output.filenameSuffix ?? '_compressed')
  return finalise(`${prefix}${original}${suffix}`)
}

/**
 * Windows silently drops trailing dots and spaces, which would quietly merge
 * two distinct names into one file. An entirely empty name is not writable at
 * all, so fall back to something predictable.
 */
function finalise(name: string): string {
  const trimmed = name.replace(/[. ]+$/, '')
  return trimmed === '' ? 'image' : trimmed
}

/**
 * Guards against a name escaping the chosen output folder. `rel` is compared
 * against `..` as a whole segment on purpose: a legitimate file called
 * `..backup.jpg` produces a relative path starting with `..` while staying
 * safely inside the directory.
 */
function assertInside(dir: string, target: string): void {
  const rel = path.relative(dir, target)
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`출력 경로가 지정한 폴더를 벗어납니다: ${target}`)
  }
}

/** Guards against a pathological name spinning the de-duplication loop forever. */
const MAX_NAME_ATTEMPTS = 10_000

export type ReserveOutputPath = (name: string, ext: string) => string | null

/**
 * Hands out a unique write target per output file.
 *
 * Two inputs with the same basename (from different folders) previously mapped
 * onto the same output path and the later one silently destroyed the earlier
 * result, with both still reported as successes. Reservation is synchronous so
 * concurrent workers can never be handed the same path — call it before any
 * `await`.
 *
 * Within a batch names are always de-duplicated, including under 'overwrite':
 * that policy is about replacing results from *earlier runs*, not about
 * discarding files this run just produced. Returns null when the file should be
 * skipped entirely.
 */
export function createOutputPathReserver(
  outputDir: string,
  policy: OutputOptions['onConflict'],
  fileExists: (p: string) => boolean = fs.existsSync,
): ReserveOutputPath {
  const dir = path.resolve(outputDir)
  const reserved = new Set<string>()

  const taken = (p: string) => reserved.has(p) || (policy !== 'overwrite' && fileExists(p))

  return function reserve(name, ext) {
    const target = path.join(dir, `${name}.${ext}`)
    assertInside(dir, target)

    if (policy === 'skip' && fileExists(target)) return null

    if (!taken(target)) {
      reserved.add(target)
      return target
    }

    for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
      const candidate = path.join(dir, `${name}-${n}.${ext}`)
      if (!taken(candidate)) {
        reserved.add(candidate)
        return candidate
      }
    }

    throw new Error(`사용 가능한 출력 파일명을 찾지 못했습니다: ${name}.${ext}`)
  }
}
