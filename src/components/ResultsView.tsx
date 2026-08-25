import type { ProcessingResult } from '../types'
import { formatDuration, formatSize } from '../utils/format'

interface ResultsViewProps {
  results: ProcessingResult[]
  elapsedMs: number
  /** Files the batch started with; larger than `results` when it was cancelled. */
  total: number
  onReset: () => void
}

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

export function ResultsView({ results, elapsedMs, total, onReset }: ResultsViewProps) {
  const notProcessed = Math.max(0, total - results.length)
  const succeeded = results.filter((r) => r.success)
  // Skipped files are reported as not-success so they stay out of the size
  // totals, but they are a deliberate outcome rather than a failure.
  const skipped = results.filter((r) => r.skipped)
  const failed = results.filter((r) => !r.success && !r.skipped)
  const totalOriginal = succeeded.reduce((sum, r) => sum + r.originalSize, 0)
  const totalProcessed = succeeded.reduce((sum, r) => sum + r.processedSize, 0)
  // Output can be larger than input — an upscale, or a lossless PNG re-encode.
  // Reporting that as "-12.3% 절감" reads as a saving of a negative amount.
  const savedRatio = totalOriginal > 0 ? 1 - totalProcessed / totalOriginal : 0
  const grew = savedRatio < 0
  const savedPercent = (Math.abs(savedRatio) * 100).toFixed(1)

  return (
    <div className="results">
      <div className="results-summary">
        <h2>{notProcessed > 0 ? '처리 취소됨' : '처리 완료'}</h2>
        {notProcessed > 0 && (
          <p className="results-note">{total}개 중 {results.length}개까지 처리했습니다.</p>
        )}
        <div className="results-stats">
          <div className="stat">
            <span className="stat-value">{succeeded.length}</span>
            <span className="stat-label">성공</span>
          </div>
          {skipped.length > 0 && (
            <div className="stat">
              <span className="stat-value">{skipped.length}</span>
              <span className="stat-label">건너뜀</span>
            </div>
          )}
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
          <div className={`stat ${grew ? 'stat-warn' : 'stat-highlight'}`}>
            <span className="stat-value">{savedPercent}%</span>
            <span className="stat-label">{grew ? '증가' : '절감'}</span>
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
          <li
            key={`${r.inputPath}-${i}`}
            className={`result-item ${r.success || r.skipped ? '' : 'result-error'}`}
          >
            <span className="result-name">{basename(r.inputPath)}</span>
            {r.success ? (
              <span className="result-meta">
                {formatSize(r.originalSize)} → {formatSize(r.processedSize)}
                {' '}({r.width}×{r.height})
              </span>
            ) : r.skipped ? (
              <span className="result-meta">같은 이름의 파일이 있어 건너뜀</span>
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
