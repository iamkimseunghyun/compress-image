// Must stay first: it sizes the libuv threadpool that Sharp's encoders run on,
// and the pool's size is fixed the first time anything uses it.
import './threadpool'
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { processImages, getImageInfo, getSupportedExtensions } from './imageProcessor'
import { loadWindowState, trackWindowState } from './windowState'
import { expandPaths } from './fileScan'
import { parseProcessRequest } from './ipcValidation'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let mainWindow: BrowserWindow | null = null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  const saved = loadWindowState()

  mainWindow = new BrowserWindow({
    ...saved,
    width: saved.width ?? 960,
    height: saved.height ?? 720,
    minWidth: 760,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload only needs contextBridge/ipcRenderer/webUtils, all of which
      // a sandboxed preload still gets.
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  })

  if (saved.maximised) mainWindow.maximize()
  trackWindowState(mainWindow)

  // Prevent Electron from navigating to dropped files
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())
  // Nothing in the UI opens a window; deny rather than leave the door open.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.on('closed', () => { mainWindow = null })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

app.whenReady().then(() => {
  // Show the app icon in the Dock during `npm run dev` (packaged builds get it
  // from electron-builder). __dirname is dist-electron/ in dev.
  if (process.platform === 'darwin' && !app.isPackaged) {
    const devIcon = path.join(__dirname, '../build/icon.png')
    if (fs.existsSync(devIcon)) app.dock?.setIcon(devIcon)
  }
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ── IPC Handlers ──

// Derived from Sharp's own capabilities rather than hard-coded, so the dialog
// filter and the drop zone can never offer a format that fails on open.
const supportedExtensions = getSupportedExtensions()

ipcMain.handle('get-supported-extensions', () => supportedExtensions)

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: supportedExtensions }],
  })
  return result.filePaths
})

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections'],
  })
  return result.filePaths
})

// Dropped or picked paths may be folders; walking them here keeps the renderer
// free of filesystem access.
ipcMain.handle('expand-paths', async (_event, paths: unknown) => {
  if (!Array.isArray(paths)) return []
  const inputs = paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
  return expandPaths(inputs, supportedExtensions)
})

ipcMain.handle('open-path', async (_event, target: string) => {
  // openPath refuses anything outside a real filesystem entry, and returns a
  // message rather than throwing.
  return shell.openPath(target)
})

ipcMain.handle('show-item-in-folder', (_event, target: string) => {
  shell.showItemInFolder(target)
})

ipcMain.handle('show-error', async (event, title: string, message: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const options = { type: 'error' as const, title, message, buttons: ['확인'] }
  if (win) await dialog.showMessageBox(win, options)
  else await dialog.showMessageBox(options)
})

ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.filePaths[0] ?? null
})

ipcMain.handle('get-image-info', async (_event, filePath: string) => {
  return getImageInfo(filePath)
})

// The renderer restores a previously chosen output folder from localStorage; it
// may since have been deleted, renamed, or live on an unmounted volume.
ipcMain.handle('directory-exists', async (_event, dir: string) => {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
})

// Set for the batch currently in flight. Only one batch can run at a time —
// the renderer disables the start button while processing.
let cancelRequested = false

ipcMain.handle('cancel-processing', () => {
  cancelRequested = true
})

ipcMain.handle('process-images', async (event, args) => {
  // The renderer coerces its own settings, but this process holds the
  // file-writing privileges and must not depend on that.
  const { files, resize, output } = parseProcessRequest(args)
  cancelRequested = false

  return processImages(
    files,
    resize,
    output,
    (progress) => {
      // The window can be closed mid-batch; sending to destroyed webContents throws.
      if (!event.sender.isDestroyed()) {
        event.sender.send('process-progress', progress)
      }
    },
    // Closing the window mid-batch also stops the work, rather than leaving it
    // grinding through hundreds of files nobody is waiting for.
    () => cancelRequested || event.sender.isDestroyed(),
  )
})
