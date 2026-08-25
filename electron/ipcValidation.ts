import path from 'node:path'
import type { OutputOptions, ResizeOptions } from '../src/types'

/**
 * The renderer already coerces its own settings, but the main process must not
 * depend on that: it holds the file-writing privileges, and a compromised or
 * simply buggy renderer would otherwise hand Sharp an unbounded dimension or
 * write to a relative path resolved against the app's working directory.
 */

export const MAX_FILES = 10_000
export const MAX_DIMENSION = 20_000

export interface ProcessRequest {
  files: string[]
  resize: ResizeOptions
  output: OutputOptions
}

/** Ceiling on how many files one estimate may encode. */
export const MAX_ESTIMATE_SAMPLES = 5

const RESIZE_MODES = ['none', 'percentage', 'dimensions'] as const
const FITS = ['cover', 'contain', 'fill', 'inside', 'outside'] as const
const FORMATS = ['original', 'jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'] as const
const COMPRESSIONS = ['max', 'fast'] as const
const CONFLICTS = ['number', 'overwrite', 'skip'] as const

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function fileList(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) throw new Error('처리할 파일 목록이 올바르지 않습니다')
  const files = raw.filter((f): f is string => typeof f === 'string' && f.length > 0)
  if (files.length === 0) throw new Error('처리할 파일이 없습니다')
  if (files.length > limit) {
    throw new Error(`한 번에 처리할 수 있는 파일은 ${limit}개까지입니다 (요청: ${files.length}개)`)
  }
  return files
}

/**
 * Throws for anything with no safe fallback; clamps everything else. A bad
 * quality value should not fail the batch, but a missing output directory has
 * no sane default — writing somewhere arbitrary is worse than refusing.
 */
export function parseProcessRequest(raw: unknown): ProcessRequest {
  const args = record(raw)
  const files = fileList(args.files, MAX_FILES)
  const outputDir = str(record(args.output).outputDir)

  if (outputDir === '') throw new Error('출력 폴더가 지정되지 않았습니다')
  // A relative path would resolve against the app's working directory, which is
  // wherever it happened to be launched from.
  if (!path.isAbsolute(outputDir)) throw new Error(`출력 폴더는 절대 경로여야 합니다: ${outputDir}`)

  return { files, ...parseSettings(args, outputDir) }
}

/**
 * The estimate encodes to memory, so it needs no output directory — requiring
 * one would hide the estimate until after the user picks a folder, which is
 * exactly when it is least useful.
 */
export function parseEstimateRequest(raw: unknown): ProcessRequest {
  const args = record(raw)
  return { files: fileList(args.files, MAX_ESTIMATE_SAMPLES), ...parseSettings(args, '') }
}

function parseSettings(args: Record<string, unknown>, outputDir: string): Omit<ProcessRequest, 'files'> {
  const resizeRaw = record(args.resize)
  const outputRaw = record(args.output)

  return {
    resize: {
      mode: oneOf(resizeRaw.mode, RESIZE_MODES, 'none'),
      percentage: int(resizeRaw.percentage, 1, 100, 100),
      width: int(resizeRaw.width, 0, MAX_DIMENSION, 0),
      height: int(resizeRaw.height, 0, MAX_DIMENSION, 0),
      fit: oneOf(resizeRaw.fit, FITS, 'inside'),
      noEnlarge: outputBool(resizeRaw.noEnlarge, true),
    },
    output: {
      format: oneOf(outputRaw.format, FORMATS, 'original'),
      quality: int(outputRaw.quality, 1, 100, 80),
      compression: oneOf(outputRaw.compression, COMPRESSIONS, 'max'),
      palette: outputBool(outputRaw.palette, false),
      paletteColours: int(outputRaw.paletteColours, 2, 256, 256),
      onConflict: oneOf(outputRaw.onConflict, CONFLICTS, 'number'),
      outputDir,
      filenameBase: str(outputRaw.filenameBase),
      numberPadding: int(outputRaw.numberPadding, 1, 6, 3),
      filenamePrefix: str(outputRaw.filenamePrefix),
      filenameSuffix: str(outputRaw.filenameSuffix, '_compressed'),
    },
  }
}

function outputBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
