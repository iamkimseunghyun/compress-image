import { useState, useCallback, useRef } from 'react'

// Which formats to name in the hint, in the order users think of them. Filtered
// against what Sharp can actually read, so an unsupported one is never shown.
const HINT_ORDER = ['jpg', 'png', 'webp', 'avif', 'tiff', 'gif', 'svg', 'heic']

interface DropZoneProps {
  onAddFiles: () => void
  onAddFolder: () => void
  onDropFiles: (paths: string[]) => void
  fileCount: number
  /** Readable extensions without the leading dot, reported by the main process. */
  extensions: string[]
}

export function DropZone({ onAddFiles, onAddFolder, onDropFiles, fileCount, extensions }: DropZoneProps) {
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

    // Everything dropped is forwarded as-is: a folder has no useful extension,
    // and only the main process can tell one from a file or walk its contents.
    const paths: string[] = []
    for (const file of Array.from(e.dataTransfer.files)) {
      // Use Electron's webUtils.getPathForFile() via preload bridge
      const filePath = window.api.getPathForFile(file)
      if (filePath) paths.push(filePath)
    }
    if (paths.length) onDropFiles(paths)
  }, [onDropFiles])

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onAddFiles}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        // Space would otherwise scroll the panel as well as activating.
        e.preventDefault()
        onAddFiles()
      }}
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
          {HINT_ORDER.filter((e) => extensions.includes(e)).map((e) => e.toUpperCase()).join(', ')}
        </span>
        <button
          className="btn-text dropzone-folder"
          onClick={(e) => { e.stopPropagation(); onAddFolder() }}
        >
          폴더 추가
        </button>
      </div>
    </div>
  )
}
