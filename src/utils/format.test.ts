import { describe, expect, it } from 'vitest'
import { formatDuration, formatSize } from './format'

describe('formatSize', () => {
  it('shows raw bytes below 1 KB', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(1023)).toBe('1023 B')
  })

  it('switches to KB at exactly 1024 bytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('switches to MB at exactly 1 MiB', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatSize(5 * 1024 * 1024 + 512 * 1024)).toBe('5.5 MB')
  })
})

describe('formatDuration', () => {
  it('shows milliseconds below a second', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('shows one decimal of seconds below a minute', () => {
    expect(formatDuration(1000)).toBe('1.0초')
    expect(formatDuration(12_340)).toBe('12.3초')
  })

  it('never renders "1분 60초" at the rounding boundary', () => {
    // 59.95s rounds to 60s, which naive minute/second maths would print as 1분 60초.
    expect(formatDuration(59_950)).toBe('1분 0초')
    expect(formatDuration(59_949)).toBe('59.9초')
  })

  it('splits minutes and seconds above a minute', () => {
    expect(formatDuration(90_000)).toBe('1분 30초')
    expect(formatDuration(3_661_000)).toBe('61분 1초')
  })
})
