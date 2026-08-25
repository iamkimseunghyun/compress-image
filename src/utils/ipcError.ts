/**
 * Electron wraps a rejected `ipcRenderer.invoke` as
 * `Error invoking remote method 'x': Error: <real message>`, which is noise for
 * anyone reading why their file was skipped.
 */
const IPC_WRAPPER = /^Error invoking remote method '[^']*':\s*/
const ERROR_PREFIX = /^(?:[A-Za-z]*Error):\s*/

/** libvips messages users actually hit when adding files. */
const KNOWN_CAUSES: [RegExp, string][] = [
  [/unsupported image format/i, '지원하지 않는 형식이거나 파일이 손상되었습니다'],
  [/input file is missing|no such file/i, '파일을 찾을 수 없습니다'],
  [/permission denied|EACCES/i, '파일을 읽을 권한이 없습니다'],
  [/premature end|truncated/i, '파일이 손상되었거나 잘렸습니다'],
]

export function describeIpcError(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason)
  const message = raw.replace(IPC_WRAPPER, '').replace(ERROR_PREFIX, '').trim()

  const known = KNOWN_CAUSES.find(([pattern]) => pattern.test(message))
  return known ? known[1] : message || '알 수 없는 오류'
}
