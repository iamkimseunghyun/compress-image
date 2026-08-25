import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: that config loads
// vite-plugin-electron, which would spawn an Electron process on every test run.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts'],
  },
})
