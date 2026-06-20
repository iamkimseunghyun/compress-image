import type { ImageFileInfo } from '../types'

interface ImageListProps {
  files: ImageFileInfo[]
  onRemove: (path: string) => void
  onClear: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ImageList({ files, onRemove, onClear }: ImageListProps) {
  if (files.length === 0) return null

  return (
    <div className="image-list">
      <div className="image-list-header">
        <span className="image-list-count">{files.length}개 파일</span>
        <button className="btn-text" onClick={onClear}>전체 삭제</button>
      </div>
      <ul className="image-list-items">
        {files.map((file) => (
          <li key={file.path} className="image-list-item">
            <div className="image-info">
              <span className="image-name" title={file.path}>{file.name}</span>
              <span className="image-meta">
                {file.width}×{file.height} · {formatSize(file.size)} · {file.format}
              </span>
            </div>
            <button className="btn-remove" onClick={() => onRemove(file.path)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
