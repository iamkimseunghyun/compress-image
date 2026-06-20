export interface ImageFileInfo {
  path: string
  name: string
  size: number
  width: number
  height: number
  format: string
}

export interface ResizeOptions {
  mode: 'none' | 'percentage' | 'dimensions'
  percentage: number
  width: number
  height: number
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
}

export interface OutputOptions {
  format: 'original' | 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff' | 'gif'
  quality: number
  outputDir: string
  filenamePrefix: string
  filenameSuffix: string
}

export interface ProcessingResult {
  inputPath: string
  outputPath: string
  originalSize: number
  processedSize: number
  width: number
  height: number
  success: boolean
  error?: string
}

export interface ProcessingProgress {
  current: number
  total: number
  currentFile: string
}

export interface ElectronAPI {
  selectFiles: () => Promise<string[]>
  selectOutputDir: () => Promise<string | null>
  getImageInfo: (filePath: string) => Promise<ImageFileInfo>
  getPathForFile: (file: File) => string
  processImages: (
    files: string[],
    resize: ResizeOptions,
    output: OutputOptions,
  ) => Promise<ProcessingResult[]>
  onProgress: (callback: (progress: ProcessingProgress) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
