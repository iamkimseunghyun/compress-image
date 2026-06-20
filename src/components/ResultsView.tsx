import type { ProcessingResult } from '../types'

interface ResultsViewProps {
  results: ProcessingResult[]
  elapsedMs: number
  onReset: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
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

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

export function ResultsView({ results, elapsedMs, onReset }: ResultsViewProps) {
  const succeeded = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)
  const totalOriginal = succeeded.reduce((sum, r) => sum + r.originalSize, 0)
  const totalProcessed = succeeded.reduce((sum, r) => sum + r.processedSize, 0)
  const savedPercent = totalOriginal > 0
    ? ((1 - totalProcessed / totalOriginal) * 100).toFixed(1)
    : '0'

  return (
    <div className="results">
      <div className="results-summary">
        <h2>처리 완료</h2>
        <div className="results-stats">
          <div className="stat">
            <span className="stat-value">{succeeded.length}</span>
            <span className="stat-label">성공</span>
          </div>
          {failed.length > 0 && (
            <div className="stat stat-error">
              <span className="stat-value">{failed.length}</span>
              <span className="stat-label">실패</span>
            </div>
          )}
          <div className="stat">
            <span className="stat-value">{formatSize(totalOriginal)}</span>
            <span className="stat-label">원본 합계</span>
          </div>
          <div className="stat">
            <span className="stat-value">{formatSize(totalProcessed)}</span>
            <span className="stat-label">결과 합계</span>
          </div>
          <div className="stat stat-highlight">
            <span className="stat-value">{savedPercent}%</span>
            <span className="stat-label">절감</span>
          </div>
          {elapsedMs > 0 && (
            <div className="stat">
              <span className="stat-value">{formatDuration(elapsedMs)}</span>
              <span className="stat-label">소요 시간</span>
            </div>
          )}
        </div>
      </div>

      <ul className="results-list">
        {results.map((r, i) => (
          <li key={`${r.inputPath}-${i}`} className={`result-item ${r.success ? '' : 'result-error'}`}>
            <span className="result-name">{basename(r.inputPath)}</span>
            {r.success ? (
              <span className="result-meta">
                {formatSize(r.originalSize)} → {formatSize(r.processedSize)}
                {' '}({r.width}×{r.height})
              </span>
            ) : (
              <span className="result-meta result-error-text">{r.error}</span>
            )}
          </li>
        ))}
      </ul>

      <button className="btn-process" onClick={onReset}>
        새로운 작업
      </button>
    </div>
  )
}
