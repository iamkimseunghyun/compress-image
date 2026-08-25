import type { ResizeOptions, OutputOptions } from '../types'

interface SettingsProps {
  resize: ResizeOptions
  output: OutputOptions
  onResizeChange: (resize: ResizeOptions) => void
  onOutputChange: (output: OutputOptions) => void
  onSelectOutputDir: () => void
}

const FIT_OPTIONS: { value: ResizeOptions['fit']; label: string }[] = [
  { value: 'inside', label: '비율 유지 · 지정 크기 안에 맞춤' },
  { value: 'outside', label: '비율 유지 · 지정 크기를 덮음' },
  { value: 'cover', label: '채우기 (잘림)' },
  { value: 'contain', label: '맞추기 (여백 추가)' },
  { value: 'fill', label: '늘리기 (비율 무시)' },
]

const PALETTE_COLOUR_OPTIONS = [256, 128, 64, 32]

const CONFLICT_OPTIONS: { value: OutputOptions['onConflict']; label: string; hint: string }[] = [
  { value: 'number', label: '번호 붙이기', hint: '기존 파일을 그대로 두고 이름 뒤에 -1, -2를 붙입니다' },
  { value: 'overwrite', label: '덮어쓰기', hint: '이전 작업 결과를 새 결과로 바꿉니다' },
  { value: 'skip', label: '건너뛰기', hint: '이미 있는 파일은 처리하지 않습니다' },
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
          <label htmlFor="resize-mode">모드</label>
          <select
            id="resize-mode"
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
            <label htmlFor="resize-percentage">{resize.percentage}%</label>
            <input
              id="resize-percentage"
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
              <label htmlFor="resize-width">가로 (px)</label>
              <input
                id="resize-width"
                type="number"
                min={1}
                max={20000}
                value={resize.width}
                onChange={(e) => onResizeChange({ ...resize, width: Number(e.target.value) })}
              />
            </div>
            <div className="setting-row">
              <label htmlFor="resize-height">세로 (px)</label>
              <input
                id="resize-height"
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
            <label htmlFor="resize-fit">맞춤 방식</label>
            <select
              id="resize-fit"
              value={resize.fit}
              onChange={(e) => onResizeChange({ ...resize, fit: e.target.value as ResizeOptions['fit'] })}
            >
              {FIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {resize.mode !== 'none' && (
          <>
            <div className="setting-row setting-row-check">
              <input
                id="no-enlarge"
                type="checkbox"
                checked={resize.noEnlarge}
                onChange={(e) => onResizeChange({ ...resize, noEnlarge: e.target.checked })}
              />
              <label htmlFor="no-enlarge">원본보다 크게 만들지 않기</label>
            </div>
            {resize.noEnlarge && resize.fit === 'contain' && (
              <p className="setting-hint">
                ‘맞추기’는 지정한 크기를 항상 채우므로 이 설정이 적용되지 않습니다.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── Output ── */}
      <section className="settings-section">
        <h3>출력 설정</h3>

        <div className="setting-row">
          <label htmlFor="output-format">포맷</label>
          <select
            id="output-format"
            value={output.format}
            onChange={(e) => onOutputChange({ ...output, format: e.target.value as OutputOptions['format'] })}
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label htmlFor="output-compression">압축 강도</label>
          <select
            id="output-compression"
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
          <label htmlFor="output-quality">품질 {output.quality}%</label>
          <input
            id="output-quality"
            type="range"
            min={1}
            max={100}
            value={output.quality}
            onChange={(e) => onOutputChange({ ...output, quality: Number(e.target.value) })}
          />
          <p className="setting-hint">
            JPEG · WebP · AVIF · TIFF에만 적용됩니다. PNG · GIF는 아래 색상 압축을 사용하세요.
          </p>
        </div>

        <div className="setting-row setting-row-check">
          <input
            id="palette"
            type="checkbox"
            checked={output.palette}
            onChange={(e) => onOutputChange({ ...output, palette: e.target.checked })}
          />
          <label htmlFor="palette">PNG · GIF 색상 압축</label>
        </div>

        {output.palette ? (
          <div className="setting-row">
            <label htmlFor="palette-colours">최대 색상 수</label>
            <select
              id="palette-colours"
              value={output.paletteColours}
              onChange={(e) =>
                onOutputChange({ ...output, paletteColours: Number(e.target.value) })
              }
            >
              {PALETTE_COLOUR_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}색</option>
              ))}
            </select>
            <p className="setting-hint">색을 줄여 파일을 크게 줄이지만 되돌릴 수 없습니다.</p>
          </div>
        ) : (
          <p className="setting-hint">끄면 PNG는 무손실로 저장됩니다.</p>
        )}

        <div className="setting-row">
          <label htmlFor="filename-base">새 파일명 (이름 바꾸기)</label>
          <input
            id="filename-base"
            type="text"
            placeholder="비워두면 원본 이름 유지"
            value={output.filenameBase ?? ''}
            onChange={(e) => onOutputChange({ ...output, filenameBase: e.target.value })}
          />
        </div>

        {renaming && (
          <div className="setting-row">
            <label htmlFor="number-padding">번호 자릿수</label>
            <input
              id="number-padding"
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
          <label htmlFor="filename-prefix">파일명 접두사</label>
          <input
            id="filename-prefix"
            type="text"
            placeholder="예: resized_"
            value={output.filenamePrefix}
            disabled={renaming}
            onChange={(e) => onOutputChange({ ...output, filenamePrefix: e.target.value })}
          />
        </div>

        <div className="setting-row">
          <label htmlFor="filename-suffix">파일명 접미사</label>
          <input
            id="filename-suffix"
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
          <label htmlFor="on-conflict">같은 이름이 있을 때</label>
          <select
            id="on-conflict"
            value={output.onConflict}
            onChange={(e) =>
              onOutputChange({ ...output, onConflict: e.target.value as OutputOptions['onConflict'] })
            }
          >
            {CONFLICT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="setting-hint">
            {CONFLICT_OPTIONS.find((o) => o.value === output.onConflict)?.hint ?? ''}
          </p>
        </div>

        <div className="setting-row">
          <label htmlFor="output-dir">출력 폴더</label>
          <button id="output-dir" className="btn-select-dir" onClick={onSelectOutputDir}>
            {output.outputDir || '폴더 선택...'}
          </button>
        </div>
      </section>
    </div>
  )
}
