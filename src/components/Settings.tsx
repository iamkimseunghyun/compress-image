import type { ResizeOptions, OutputOptions } from '../types'

interface SettingsProps {
  resize: ResizeOptions
  output: OutputOptions
  onResizeChange: (resize: ResizeOptions) => void
  onOutputChange: (output: OutputOptions) => void
  onSelectOutputDir: () => void
}

const FIT_OPTIONS: { value: ResizeOptions['fit']; label: string }[] = [
  { value: 'inside', label: '비율 유지 (축소)' },
  { value: 'outside', label: '비율 유지 (확대)' },
  { value: 'cover', label: '채우기 (잘림)' },
  { value: 'contain', label: '맞추기 (여백)' },
  { value: 'fill', label: '늘리기' },
]

const COMPRESSION_OPTIONS: { value: OutputOptions['compression']; label: string; hint: string }[] = [
  { value: 'max', label: '최대 압축', hint: '파일이 가장 작지만 느립니다' },
  { value: 'fast', label: '빠른 압축', hint: '몇 배 빠르지만 파일이 15~40% 큽니다' },
]

const FORMAT_OPTIONS: { value: OutputOptions['format']; label: string }[] = [
  { value: 'original', label: '원본 유지' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'tiff', label: 'TIFF' },
  { value: 'gif', label: 'GIF' },
]

export function Settings({ resize, output, onResizeChange, onOutputChange, onSelectOutputDir }: SettingsProps) {
  const renaming = (output.filenameBase ?? '').trim() !== ''
  const compressionHint =
    COMPRESSION_OPTIONS.find((o) => o.value === output.compression)?.hint ?? ''
  const filenamePreview = renaming
    ? `${(output.filenameBase ?? '').trim()}_${'1'.padStart(Math.max(1, output.numberPadding ?? 3), '0')}.jpg`
    : `${output.filenamePrefix ?? ''}example${output.filenameSuffix ?? ''}.jpg`

  return (
    <div className="settings">
      {/* ── Resize ── */}
      <section className="settings-section">
        <h3>리사이즈</h3>

        <div className="setting-row">
          <label>모드</label>
          <select
            value={resize.mode}
            onChange={(e) => onResizeChange({ ...resize, mode: e.target.value as ResizeOptions['mode'] })}
          >
            <option value="none">리사이즈 안 함</option>
            <option value="percentage">비율 (%)</option>
            <option value="dimensions">크기 지정 (px)</option>
          </select>
        </div>

        {resize.mode === 'percentage' && (
          <div className="setting-row">
            <label>{resize.percentage}%</label>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={resize.percentage}
              onChange={(e) => onResizeChange({ ...resize, percentage: Number(e.target.value) })}
            />
          </div>
        )}

        {resize.mode === 'dimensions' && (
          <>
            <div className="setting-row">
              <label>가로 (px)</label>
              <input
                type="number"
                min={1}
                max={20000}
                value={resize.width}
                onChange={(e) => onResizeChange({ ...resize, width: Number(e.target.value) })}
              />
            </div>
            <div className="setting-row">
              <label>세로 (px)</label>
              <input
                type="number"
                min={1}
                max={20000}
                value={resize.height}
                onChange={(e) => onResizeChange({ ...resize, height: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        {resize.mode !== 'none' && (
          <div className="setting-row">
            <label>맞춤 방식</label>
            <select
              value={resize.fit}
              onChange={(e) => onResizeChange({ ...resize, fit: e.target.value as ResizeOptions['fit'] })}
            >
              {FIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* ── Output ── */}
      <section className="settings-section">
        <h3>출력 설정</h3>

        <div className="setting-row">
          <label>포맷</label>
          <select
            value={output.format}
            onChange={(e) => onOutputChange({ ...output, format: e.target.value as OutputOptions['format'] })}
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label>압축 강도</label>
          <select
            value={output.compression}
            onChange={(e) =>
              onOutputChange({ ...output, compression: e.target.value as OutputOptions['compression'] })
            }
          >
            {COMPRESSION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="setting-hint">{compressionHint}</p>
        </div>

        <div className="setting-row">
          <label>품질 {output.quality}%</label>
          <input
            type="range"
            min={1}
            max={100}
            value={output.quality}
            onChange={(e) => onOutputChange({ ...output, quality: Number(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <label>새 파일명 (이름 바꾸기)</label>
          <input
            type="text"
            placeholder="비워두면 원본 이름 유지"
            value={output.filenameBase ?? ''}
            onChange={(e) => onOutputChange({ ...output, filenameBase: e.target.value })}
          />
        </div>

        {renaming && (
          <div className="setting-row">
            <label>번호 자릿수</label>
            <input
              type="number"
              min={1}
              max={6}
              value={output.numberPadding ?? 3}
              onChange={(e) =>
                onOutputChange({ ...output, numberPadding: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </div>
        )}

        <div className="setting-row">
          <label>파일명 접두사</label>
          <input
            type="text"
            placeholder="예: resized_"
            value={output.filenamePrefix}
            disabled={renaming}
            onChange={(e) => onOutputChange({ ...output, filenamePrefix: e.target.value })}
          />
        </div>

        <div className="setting-row">
          <label>파일명 접미사</label>
          <input
            type="text"
            placeholder="예: _compressed"
            value={output.filenameSuffix}
            disabled={renaming}
            onChange={(e) => onOutputChange({ ...output, filenameSuffix: e.target.value })}
          />
        </div>

        <div className="filename-preview">
          <span className="preview-label">미리보기:</span>
          <code>{filenamePreview}</code>
        </div>

        <div className="setting-row">
          <label>출력 폴더</label>
          <button className="btn-select-dir" onClick={onSelectOutputDir}>
            {output.outputDir || '폴더 선택...'}
          </button>
        </div>
      </section>
    </div>
  )
}
