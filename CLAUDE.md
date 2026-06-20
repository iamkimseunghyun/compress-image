# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop app for batch image resizing and compression. Uses Sharp (libvips) for high-performance image processing with support for JPEG, PNG, WebP, AVIF, TIFF, GIF, SVG, HEIF formats.

## Commands

```bash
npm run dev       # Start Vite dev server + Electron (hot reload)
npm run typecheck # tsc --noEmit for both renderer (tsconfig.json) and electron/vite (tsconfig.node.json)
npm run build     # typecheck + Vite production build (renderer + main + preload)
npm run package   # Build + create platform installer (electron-builder)
```

App icons live in `build/` (`icon.png`/`icon.icns`/`icon.ico`, source `icon.svg`) and are wired into electron-builder per platform.

## Architecture

**Process model** — Electron's main/renderer split with IPC bridge:

- `electron/main.ts` — Electron main process: window creation, IPC handlers for file dialogs and image processing
- `electron/preload.ts` — Context bridge exposing `window.api` to renderer (contextIsolation enabled)
- `electron/imageProcessor.ts` — Sharp-based processing: resize, format conversion, quality control, batch execution with progress callbacks
- `src/` — React renderer (Vite-bundled): App state manages file list, settings, processing lifecycle

**IPC channels**: `select-files`, `select-output-dir`, `get-image-info`, `process-images`, `process-progress` (main→renderer)

**Build pipeline** — `vite-plugin-electron` compiles both main and preload TS into `dist-electron/`, while Vite builds renderer to `dist/`. Sharp is externalized from the bundle as a native module.

## Key Types

All shared types live in `src/types.ts`: `ImageFileInfo`, `ResizeOptions`, `OutputOptions`, `ProcessingResult`, `ProcessingProgress`, `ElectronAPI` (global `window.api`).

## Sharp Native Module

Sharp is a native Node.js addon. When modifying electron-builder config or upgrading Electron, ensure native module rebuilding works (`electron-rebuild` if needed). Sharp is externalized in `vite.config.ts` rollupOptions.
