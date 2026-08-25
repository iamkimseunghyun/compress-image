import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface WindowState extends Rectangle {
  maximised: boolean
}

const DEFAULT_SIZE = { width: 960, height: 720 }
const SAVE_DEBOUNCE_MS = 400

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

/**
 * A saved position can point at a display that has since been unplugged, or at
 * coordinates that no longer exist after a resolution change, which would open
 * the window off-screen with no way to drag it back. Only keep the position if
 * it still overlaps a real display.
 */
function isOnScreen(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
    const overlapY = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
    // Require a real sliver of the titlebar to be grabbable, not just a pixel.
    return overlapX > 80 && overlapY > 40
  })
}

function isRectangle(value: unknown): value is Rectangle {
  const r = value as Rectangle | null
  return !!r && (['x', 'y', 'width', 'height'] as const).every((k) => Number.isFinite(r[k]))
}

export function loadWindowState(): Partial<WindowState> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    if (!isRectangle(parsed)) return DEFAULT_SIZE

    const maximised = (parsed as Partial<WindowState>).maximised === true
    const size = { width: parsed.width, height: parsed.height }
    return isOnScreen(parsed) ? { ...parsed, maximised } : { ...size, maximised }
  } catch {
    // Missing or corrupt state is the normal first-run case.
    return DEFAULT_SIZE
  }
}

/**
 * Persists size, position and maximised state. Writes are debounced because
 * resize and move fire continuously while dragging.
 */
export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined

  const write = () => {
    if (win.isDestroyed()) return
    // getNormalBounds() reports the restored geometry, so un-maximising later
    // returns to the size the user actually chose rather than the full screen.
    const state: WindowState = { ...win.getNormalBounds(), maximised: win.isMaximized() }
    try {
      fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
      fs.writeFileSync(stateFile(), JSON.stringify(state))
    } catch {
      // Window geometry is a convenience; failing to store it must not surface.
    }
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(write, SAVE_DEBOUNCE_MS)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', () => {
    clearTimeout(timer)
    write()
  })
}
