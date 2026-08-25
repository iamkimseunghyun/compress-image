import { describe, expect, it } from 'vitest'
import { describeIpcError } from './ipcError'

describe('describeIpcError', () => {
  it('strips the Electron IPC wrapper and translates a known libvips cause', () => {
    const raw = new Error(
      "Error invoking remote method 'get-image-info': Error: Input file contains unsupported image format",
    )
    expect(describeIpcError(raw)).toBe('지원하지 않는 형식이거나 파일이 손상되었습니다')
  })

  it('keeps an unrecognised message, minus the wrapper', () => {
    const raw = new Error("Error invoking remote method 'get-image-info': Error: something odd")
    expect(describeIpcError(raw)).toBe('something odd')
  })

  it('handles a bare error with no wrapper', () => {
    expect(describeIpcError(new Error('Input file is missing'))).toBe('파일을 찾을 수 없습니다')
  })

  it('handles non-Error rejections', () => {
    expect(describeIpcError('boom')).toBe('boom')
    expect(describeIpcError(undefined)).toBe('undefined')
  })

  it('falls back when the message is empty', () => {
    expect(describeIpcError(new Error(''))).toBe('알 수 없는 오류')
  })
})
