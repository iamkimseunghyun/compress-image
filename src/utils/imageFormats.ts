/**
 * Output extension per Sharp format id. Lives in `src/` because both the main
 * process (writing files) and the renderer (previewing the resulting filename)
 * need the same mapping — they disagreed before, and the preview always said
 * `.jpg` regardless of the chosen format.
 */
const EXTENSIONS: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  tiff: 'tiff',
  gif: 'gif',
}

export function getExtension(format: string): string {
  return EXTENSIONS[format] ?? format
}
