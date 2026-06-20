import { useState, useCallback, useRef } from 'react'

const SUPPORTED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'avif',
  'tiff', 'tif', 'gif', 'svg', 'heif', 'heic',
])

interface DropZoneProps {
  onAddFiles: () => void
  onDropFiles: (paths: string[]) => void
  fileCount: number
}

export function DropZone({ onAddFiles, onDropFiles, fileCount }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    setDragging(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setDragging(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragging(false)

    const paths: string[] = []
    for (const file of Array.from(e.dataTransfer.files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        // Use Electron's webUtils.getPathForFile() via preload bridge
        const filePath = window.api.getPathForFile(file)
        if (filePath) paths.push(filePath)
      }
    }
    if (paths.length) onDropFiles(paths)
  }, [onDropFiles])

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onAddFiles}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onAddFiles() }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dropzone-content">
        <span className="dropzone-icon">{dragging ? '↓' : '+'}</span>
        <span className="dropzone-text">
          {dragging
            ? '여기에 놓으세요'
            : fileCount === 0
              ? '클릭하거나 이미지를 드래그하세요'
              : `${fileCount}개 선택됨 — 클릭 또는 드래그하여 추가`}
        </span>
        <span className="dropzone-hint">
          JPG, PNG, WebP, AVIF, TIFF, GIF, SVG, HEIF
        </span>
      </div>
    </div>
  )
}
