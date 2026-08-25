import type { OutputOptions, ResizeOptions } from '../types'

const STORAGE_KEY = 'compress-image:settings:v1'

export interface PersistedSettings {
  resize: ResizeOptions
  output: OutputOptions
}

export const DEFAULT_RESIZE: ResizeOptions = {
  mode: 'percentage',
  percentage: 50,
  width: 1920,
  height: 1080,
  fit: 'inside',
  noEnlarge: true,
}

export const DEFAULT_OUTPUT: OutputOptions = {
  format: 'original',
  quality: 80,
  compression: 'max',
  palette: false,
  paletteColours: 256,
  onConflict: 'number',
  outputDir: '',
  filenameBase: '',
  numberPadding: 3,
  filenamePrefix: '',
  filenameSuffix: '_compressed',
}

const RESIZE_MODES = ['none', 'percentage', 'dimensions'] as const
const FITS = ['cover', 'contain', 'fill', 'inside', 'outside'] as const
const FORMATS = ['original', 'jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'] as const
const COMPRESSIONS = ['max', 'fast'] as const
const CONFLICTS = ['number', 'overwrite', 'skip'] as const

/**
 * Stored settings are untrusted: they may come from an older build that lacked
 * a field, a newer one that renamed a value, or a hand-edited devtools session.
 * Every field is coerced back into range rather than trusted, so a bad entry
 * degrades to the default instead of reaching Sharp as an invalid option.
 */
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

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function coerceSettings(raw: unknown): PersistedSettings {
  const root = asRecord(raw)
  const resize = asRecord(root.resize)
  const output = asRecord(root.output)

  return {
    resize: {
      mode: oneOf(resize.mode, RESIZE_MODES, DEFAULT_RESIZE.mode),
      percentage: int(resize.percentage, 5, 100, DEFAULT_RESIZE.percentage),
      width: int(resize.width, 1, 20_000, DEFAULT_RESIZE.width),
      height: int(resize.height, 1, 20_000, DEFAULT_RESIZE.height),
      fit: oneOf(resize.fit, FITS, DEFAULT_RESIZE.fit),
      noEnlarge: bool(resize.noEnlarge, DEFAULT_RESIZE.noEnlarge),
    },
    output: {
      format: oneOf(output.format, FORMATS, DEFAULT_OUTPUT.format),
      quality: int(output.quality, 1, 100, DEFAULT_OUTPUT.quality),
      compression: oneOf(output.compression, COMPRESSIONS, DEFAULT_OUTPUT.compression),
      palette: bool(output.palette, DEFAULT_OUTPUT.palette),
      paletteColours: int(output.paletteColours, 2, 256, DEFAULT_OUTPUT.paletteColours),
      onConflict: oneOf(output.onConflict, CONFLICTS, DEFAULT_OUTPUT.onConflict),
      outputDir: text(output.outputDir, DEFAULT_OUTPUT.outputDir),
      filenameBase: text(output.filenameBase, DEFAULT_OUTPUT.filenameBase),
      numberPadding: int(output.numberPadding, 1, 6, DEFAULT_OUTPUT.numberPadding),
      filenamePrefix: text(output.filenamePrefix, DEFAULT_OUTPUT.filenamePrefix),
      filenameSuffix: text(output.filenameSuffix, DEFAULT_OUTPUT.filenameSuffix),
    },
  }
}

/** Minimal surface of `localStorage`, so tests need no DOM. */
export interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStorage(): SettingsStorage | null {
  try {
    return window.localStorage
  } catch {
    // Storage can throw outright when site data is blocked.
    return null
  }
}

export function loadSettings(storage: SettingsStorage | null = browserStorage()): PersistedSettings {
  if (!storage) return coerceSettings({})
  try {
    const stored = storage.getItem(STORAGE_KEY)
    return coerceSettings(stored === null ? {} : JSON.parse(stored))
  } catch {
    // Corrupt JSON is not worth surfacing — fall back to defaults.
    return coerceSettings({})
  }
}

export function saveSettings(
  settings: PersistedSettings,
  storage: SettingsStorage | null = browserStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // A full or unavailable quota must not break the app.
  }
}
