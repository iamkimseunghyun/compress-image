export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSeconds = ms / 1000
  // Below the 60s rounding boundary, show one decimal (e.g. 12.3초).
  if (totalSeconds < 59.95) return `${totalSeconds.toFixed(1)}초`
  // Round to whole seconds first so we never produce "1분 60초".
  const roundedSeconds = Math.round(totalSeconds)
  const minutes = Math.floor(roundedSeconds / 60)
  const seconds = roundedSeconds % 60
  return `${minutes}분 ${seconds}초`
}
