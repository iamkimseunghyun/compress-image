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
  /**
   * Never scale an image up past its original size. Sharp's 'inside'/'outside'
   * fits enlarge by default, which makes small sources *grow* in a compressor.
   * Has no effect with fit 'contain', which always pads to the exact size.
   */
  noEnlarge: boolean
}

export interface OutputOptions {
  format: 'original' | 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff' | 'gif'
  quality: number
  /**
   * Encoder effort. 'max' squeezes files smallest (mozjpeg, high effort levels);
   * 'fast' trades ~15-40% larger output for a several-fold speedup. Defaults to
   * 'max' when absent so existing callers keep their current output.
   */
  compression: 'max' | 'fast'
  /**
   * Opt-in lossy colour reduction for the palette formats (PNG, GIF). `quality`
   * does not apply to either — see USES_QUALITY in imageProcessor.ts.
   */
  palette: boolean
  /** Maximum palette entries when `palette` is on, 2-256. */
  paletteColours: number
  outputDir: string
  /** When set, fully renames output to `{filenameBase}_{number}` (prefix/suffix ignored). Empty = keep original name. */
  filenameBase: string
  /** Zero-pad width for the sequence number used with filenameBase (e.g. 3 → 001). */
  numberPadding: number
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
