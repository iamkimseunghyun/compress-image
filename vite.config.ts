import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // React writes the progress bar width as an inline style attribute.
  "style-src 'self' 'unsafe-inline'",
  // Thumbnails arrive from the main process as data: URIs.
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml() {
        return [{
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend' as const,
        }]
      },
    },
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            // Vite 8 uses Rolldown; sharp is a native module and must stay external.
            rolldownOptions: {
              external: ['sharp'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    ]),
    renderer(),
  ],
})
