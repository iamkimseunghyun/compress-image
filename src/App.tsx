import { useState, useEffect, useCallback } from 'react'
import type { ImageFileInfo, ResizeOptions, OutputOptions, ProcessingResult, ProcessingProgress } from './types'
import { DropZone } from './components/DropZone'
import { ImageList } from './components/ImageList'
import { Settings } from './components/Settings'
import { ResultsView } from './components/ResultsView'

type AppState = 'idle' | 'processing' | 'done'

export default function App() {
  const [files, setFiles] = useState<ImageFileInfo[]>([])
  const [state, setState] = useState<AppState>('idle')
  const [progress, setProgress] = useState<ProcessingProgress>({ current: 0, total: 0, currentFile: '' })
  const [results, setResults] = useState<ProcessingResult[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)

  const [resize, setResize] = useState<ResizeOptions>({
    mode: 'percentage',
    percentage: 50,
    width: 1920,
    height: 1080,
    fit: 'inside',
  })

  const [output, setOutput] = useState<OutputOptions>({
    format: 'original',
    quality: 80,
    outputDir: '',
    filenameBase: '',
    numberPadding: 3,
    filenamePrefix: '',
    filenameSuffix: '_compressed',
  })

  useEffect(() => {
    const cleanup = window.api.onProgress(setProgress)
    return cleanup
  }, [])

  // Prevent Electron default file-open behavior on drag/drop
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [])

  const addFilesByPaths = useCallback(async (paths: string[]) => {
    if (!paths.length) return
    // Skip files that fail to read (corrupt/unsupported) instead of aborting the whole batch.
    const settled = await Promise.allSettled(paths.map((p) => window.api.getImageInfo(p)))
    const infos = settled
      .filter((r): r is PromiseFulfilledResult<ImageFileInfo> => r.status === 'fulfilled')
      .map((r) => r.value)
    setFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path))
      const newFiles = infos.filter((f) => !existingPaths.has(f.path))
      return [...prev, ...newFiles]
    })
  }, [])

  const handleAddFiles = useCallback(async () => {
    const paths = await window.api.selectFiles()
    addFilesByPaths(paths)
  }, [addFilesByPaths])

  const handleDropFiles = useCallback((paths: string[]) => {
    addFilesByPaths(paths)
  }, [addFilesByPaths])

  const handleRemoveFile = useCallback((filePath: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== filePath))
  }, [])

  const handleClearFiles = useCallback(() => {
    setFiles([])
    setResults([])
    setState('idle')
  }, [])

  const handleSelectOutputDir = useCallback(async () => {
    const dir = await window.api.selectOutputDir()
    if (dir) setOutput((prev) => ({ ...prev, outputDir: dir }))
  }, [])

  const handleProcess = useCallback(async () => {
    if (!files.length || !output.outputDir) return

    setState('processing')
    setResults([])

    try {
      const filePaths = files.map((f) => f.path)
      const start = performance.now()
      const processResults = await window.api.processImages(filePaths, resize, output)
      setElapsedMs(performance.now() - start)
      setResults(processResults)
      setState('done')
    } catch (err) {
      // Unexpected IPC/processing failure — surface it and return to idle instead of hanging.
      console.error('Image processing failed:', err)
      alert(`이미지 처리 중 오류가 발생했습니다.\n${err instanceof Error ? err.message : String(err)}`)
      setState('idle')
    }
  }, [files, resize, output])

  const handleReset = useCallback(() => {
    setState('idle')
    setResults([])
  }, [])

  const isReady = files.length > 0 && output.outputDir !== ''

  return (
    <div className="app">
      <header className="app-header">
        <h1>Compress Image</h1>
        <p className="subtitle">고해상도 이미지 리사이즈 &amp; 압축</p>
      </header>

      <main className="app-main">
        {state === 'done' ? (
          <ResultsView results={results} elapsedMs={elapsedMs} onReset={handleReset} />
        ) : (
          <>
            <div className="panel-left">
              <DropZone onAddFiles={handleAddFiles} onDropFiles={handleDropFiles} fileCount={files.length} />
              <ImageList
                files={files}
                onRemove={handleRemoveFile}
                onClear={handleClearFiles}
              />
            </div>

            <div className="panel-right">
              <Settings
                resize={resize}
                output={output}
                onResizeChange={setResize}
                onOutputChange={setOutput}
                onSelectOutputDir={handleSelectOutputDir}
              />
            </div>
          </>
        )}
      </main>

      {state !== 'done' && (
        <footer className="app-footer">
          {state === 'processing' ? (
            <div className="progress-bar-container">
              <div className="progress-info">
                <span>처리 중: {progress.currentFile}</span>
                <span>{progress.current}/{progress.total}</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              className="btn-process"
              disabled={!isReady}
              onClick={handleProcess}
            >
              {!isReady
                ? files.length === 0
                  ? '이미지를 추가하세요'
                  : '출력 폴더를 선택하세요'
                : `${files.length}개 이미지 처리 시작`}
            </button>
          )}
        </footer>
      )}
    </div>
  )
}
