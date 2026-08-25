import { useState, useEffect, useCallback, useRef } from 'react'
import type { ImageFileInfo, ResizeOptions, OutputOptions, ProcessingResult, ProcessingProgress } from './types'
import { DropZone } from './components/DropZone'
import { ImageList } from './components/ImageList'
import { Settings } from './components/Settings'
import { ResultsView } from './components/ResultsView'
import { describeIpcError } from './utils/ipcError'
import { loadSettings, saveSettings } from './utils/settingsStore'

type AppState = 'idle' | 'processing' | 'done'

/** Files the last add attempt could not use, so they don't vanish silently. */
interface AddNotice {
  failed: { name: string; reason: string }[]
  duplicates: number
}

const MAX_LISTED_FAILURES = 5

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

export default function App() {
  const [files, setFiles] = useState<ImageFileInfo[]>([])
  const [state, setState] = useState<AppState>('idle')
  const [progress, setProgress] = useState<ProcessingProgress>({ current: 0, total: 0, currentFile: '' })
  const [results, setResults] = useState<ProcessingResult[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [extensions, setExtensions] = useState<string[]>([])
  const [notice, setNotice] = useState<AddNotice | null>(null)
  const [cancelling, setCancelling] = useState(false)
  // How many files the finished batch started with, so a cancelled run can say
  // how much it got through.
  const [batchTotal, setBatchTotal] = useState(0)

  // Mirrors the current paths so the add handler can count duplicates without
  // doing that bookkeeping inside a setState updater (updaters run twice under
  // StrictMode, so they must stay free of side effects).
  const knownPaths = useRef<Set<string>>(new Set())
  useEffect(() => {
    knownPaths.current = new Set(files.map((f) => f.path))
  }, [files])

  // Read once on mount so the first paint already shows the restored settings.
  const [initial] = useState(loadSettings)
  const [resize, setResize] = useState<ResizeOptions>(initial.resize)
  const [output, setOutput] = useState<OutputOptions>(initial.output)

  useEffect(() => {
    saveSettings({ resize, output })
  }, [resize, output])

  // A restored output folder may have been deleted, renamed, or live on a
  // volume that is no longer mounted. Clear it rather than showing a path that
  // will fail at write time.
  useEffect(() => {
    const restored = initial.output.outputDir
    if (!restored) return
    let stale = false
    window.api.directoryExists(restored).then((exists) => {
      if (stale || exists) return
      setOutput((prev) => (prev.outputDir === restored ? { ...prev, outputDir: '' } : prev))
    })
    return () => { stale = true }
  }, [initial])

  useEffect(() => {
    const cleanup = window.api.onProgress(setProgress)
    return cleanup
  }, [])

  useEffect(() => {
    window.api.getSupportedExtensions().then(setExtensions).catch(() => setExtensions([]))
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
    // Read failures (corrupt or undecodable) skip the file rather than aborting
    // the whole batch — but they get reported, otherwise files just disappear
    // from the list with no explanation.
    const settled = await Promise.allSettled(paths.map((p) => window.api.getImageInfo(p)))

    const infos: ImageFileInfo[] = []
    const failed: AddNotice['failed'] = []
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        infos.push(result.value)
      } else {
        failed.push({ name: basename(paths[i]), reason: describeIpcError(result.reason) })
      }
    })

    // Reserve as we go: the same path can appear twice in one drop, and two
    // rapid drops overlap because this handler awaits before setFiles commits
    // (knownPaths only catches up on the next render).
    const seenPaths = new Set(knownPaths.current)
    const added = infos.filter((f) => {
      if (seenPaths.has(f.path)) return false
      seenPaths.add(f.path)
      return true
    })
    const duplicates = infos.length - added.length
    knownPaths.current = seenPaths

    if (added.length) {
      setFiles((prev) => {
        const existingPaths = new Set(prev.map((f) => f.path))
        return [...prev, ...added.filter((f) => !existingPaths.has(f.path))]
      })
    }

    setNotice(failed.length || duplicates ? { failed, duplicates } : null)
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
    setNotice(null)
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
    setCancelling(false)
    setBatchTotal(files.length)

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
    } finally {
      setCancelling(false)
    }
  }, [files, resize, output])

  const handleCancel = useCallback(async () => {
    setCancelling(true)
    await window.api.cancelProcessing()
  }, [])

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
          <ResultsView
            results={results}
            elapsedMs={elapsedMs}
            total={batchTotal}
            onReset={handleReset}
          />
        ) : (
          <>
            {/* `inert` while processing: the batch runs off a snapshot taken at
                start, so edits made now would silently not apply. */}
            <div className="panel-left" inert={state === 'processing'}>
              <DropZone
                onAddFiles={handleAddFiles}
                onDropFiles={handleDropFiles}
                fileCount={files.length}
                extensions={extensions}
              />
              {notice && <AddNoticeBanner notice={notice} onDismiss={() => setNotice(null)} />}
              <ImageList
                files={files}
                onRemove={handleRemoveFile}
                onClear={handleClearFiles}
              />
            </div>

            <div className="panel-right" inert={state === 'processing'}>
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
                {/* Files are reported as they finish, and several run at once,
                    so naming one as "currently processing" would be a fiction. */}
                <span>{progress.currentFile ? `완료: ${progress.currentFile}` : '처리 중…'}</span>
                <span>{progress.current}/{progress.total}</span>
              </div>
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.current}
                aria-label="이미지 처리 진행률"
              >
                <div
                  className="progress-fill"
                  style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
              <button className="btn-cancel" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? '남은 작업을 정리하는 중…' : '취소'}
              </button>
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

function AddNoticeBanner({ notice, onDismiss }: { notice: AddNotice; onDismiss: () => void }) {
  const { failed, duplicates } = notice
  const parts: string[] = []
  if (failed.length) parts.push(`${failed.length}개를 읽지 못했습니다`)
  if (duplicates) parts.push(`${duplicates}개는 이미 목록에 있습니다`)

  return (
    <div className="notice" role="status">
      <div className="notice-head">
        <span>{parts.join(' · ')}</span>
        <button className="btn-text" onClick={onDismiss}>닫기</button>
      </div>
      {failed.length > 0 && (
        <ul className="notice-list">
          {failed.slice(0, MAX_LISTED_FAILURES).map((f) => (
            <li key={f.name}>
              <span className="notice-file">{f.name}</span>
              <span className="notice-reason">{f.reason}</span>
            </li>
          ))}
          {failed.length > MAX_LISTED_FAILURES && (
            <li className="notice-more">외 {failed.length - MAX_LISTED_FAILURES}개</li>
          )}
        </ul>
      )}
    </div>
  )
}
