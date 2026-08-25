import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OUTPUT,
  DEFAULT_RESIZE,
  coerceSettings,
  loadSettings,
  saveSettings,
  type SettingsStorage,
} from './settingsStore'

const memoryStorage = (initial: Record<string, string> = {}): SettingsStorage => {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

describe('coerceSettings', () => {
  it('returns defaults for an empty object', () => {
    expect(coerceSettings({})).toEqual({ resize: DEFAULT_RESIZE, output: DEFAULT_OUTPUT })
  })

  it('returns defaults for non-object input', () => {
    for (const input of [null, undefined, 42, 'nope', []]) {
      expect(coerceSettings(input).resize).toEqual(DEFAULT_RESIZE)
    }
  })

  it('keeps valid stored values', () => {
    const result = coerceSettings({
      resize: { mode: 'dimensions', percentage: 25, width: 800, height: 600, fit: 'cover', noEnlarge: false },
      output: { format: 'webp', quality: 65, onConflict: 'skip', outputDir: '/tmp/out' },
    })
    expect(result.resize).toEqual({
      mode: 'dimensions', percentage: 25, width: 800, height: 600, fit: 'cover', noEnlarge: false,
    })
    expect(result.output.format).toBe('webp')
    expect(result.output.quality).toBe(65)
    expect(result.output.onConflict).toBe('skip')
    expect(result.output.outputDir).toBe('/tmp/out')
  })

  it('falls back on an unknown enum value rather than passing it to Sharp', () => {
    const result = coerceSettings({
      resize: { fit: 'squish', mode: 'magic' },
      output: { format: 'bmp', compression: 'turbo', onConflict: 'explode' },
    })
    expect(result.resize.fit).toBe(DEFAULT_RESIZE.fit)
    expect(result.resize.mode).toBe(DEFAULT_RESIZE.mode)
    expect(result.output.format).toBe(DEFAULT_OUTPUT.format)
    expect(result.output.compression).toBe(DEFAULT_OUTPUT.compression)
    expect(result.output.onConflict).toBe(DEFAULT_OUTPUT.onConflict)
  })

  it('clamps numbers into their valid range', () => {
    const result = coerceSettings({
      resize: { percentage: 5000, width: -10, height: 999_999 },
      output: { quality: 0, paletteColours: 1024, numberPadding: 99 },
    })
    expect(result.resize.percentage).toBe(100)
    expect(result.resize.width).toBe(1)
    expect(result.resize.height).toBe(20_000)
    expect(result.output.quality).toBe(1)
    expect(result.output.paletteColours).toBe(256)
    expect(result.output.numberPadding).toBe(6)
  })

  it('rejects NaN and non-numeric values', () => {
    const result = coerceSettings({ output: { quality: 'high', paletteColours: NaN } })
    expect(result.output.quality).toBe(DEFAULT_OUTPUT.quality)
    expect(result.output.paletteColours).toBe(DEFAULT_OUTPUT.paletteColours)
  })

  it('fills in fields a previous version never wrote', () => {
    // Settings saved before palette/onConflict existed must not come back undefined.
    const result = coerceSettings({ output: { format: 'png', quality: 90 } })
    expect(result.output.palette).toBe(DEFAULT_OUTPUT.palette)
    expect(result.output.onConflict).toBe(DEFAULT_OUTPUT.onConflict)
    expect(result.resize.noEnlarge).toBe(DEFAULT_RESIZE.noEnlarge)
  })

  it('rejects a non-string path', () => {
    expect(coerceSettings({ output: { outputDir: 42 } }).output.outputDir).toBe('')
  })
})

describe('loadSettings / saveSettings', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage()
    const settings = coerceSettings({ output: { format: 'avif', quality: 55 } })
    saveSettings(settings, storage)
    expect(loadSettings(storage)).toEqual(settings)
  })

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(memoryStorage()).output).toEqual(DEFAULT_OUTPUT)
  })

  it('returns defaults for corrupt JSON instead of throwing', () => {
    const storage = memoryStorage({ 'compress-image:settings:v1': '{not json' })
    expect(loadSettings(storage).output).toEqual(DEFAULT_OUTPUT)
  })

  it('survives storage that throws', () => {
    const hostile: SettingsStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(loadSettings(hostile).output).toEqual(DEFAULT_OUTPUT)
    expect(() => saveSettings(coerceSettings({}), hostile)).not.toThrow()
  })

  it('does nothing when storage is unavailable', () => {
    expect(loadSettings(null).output).toEqual(DEFAULT_OUTPUT)
    expect(() => saveSettings(coerceSettings({}), null)).not.toThrow()
  })
})
