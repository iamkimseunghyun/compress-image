import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ResizeOptions, OutputOptions, ProcessingProgress } from '../src/types'

contextBridge.exposeInMainWorld('api', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  getImageInfo: (filePath: string) => ipcRenderer.invoke('get-image-info', filePath),
  processImages: (files: string[], resize: ResizeOptions, output: OutputOptions) =>
    ipcRenderer.invoke('process-images', { files, resize, output }),
  onProgress: (callback: (progress: ProcessingProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ProcessingProgress) =>
      callback(progress)
    ipcRenderer.on('process-progress', handler)
    return () => ipcRenderer.removeListener('process-progress', handler)
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
