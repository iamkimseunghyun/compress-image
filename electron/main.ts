import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { processImages, getImageInfo } from './imageProcessor'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let mainWindow: BrowserWindow | null = null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  })

  // Prevent Electron from navigating to dropped files
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    mainWindow = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ── IPC Handlers ──

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Images',
        extensions: [
          'jpg', 'jpeg', 'png', 'webp', 'avif',
          'tiff', 'tif', 'gif', 'svg', 'heif', 'heic',
        ],
      },
    ],
  })
  return result.filePaths
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

ipcMain.handle('process-images', async (event, args) => {
  const { files, resize, output } = args
  return processImages(files, resize, output, (progress) => {
    event.sender.send('process-progress', progress)
  })
})
