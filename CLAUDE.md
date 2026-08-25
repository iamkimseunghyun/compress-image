# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop app for batch image resizing and compression. Uses Sharp (libvips) for high-performance image processing.

**Input**: JPEG, PNG, WebP, AVIF, TIFF, GIF, SVG. Not HEIC/HEIF — the prebuilt libvips carries no HEVC decoder, so `sharp.format.heif` reports `.avif` as its only readable suffix. The accepted list is derived at runtime rather than hard-coded (see Architecture).
**Output**: JPEG, PNG, WebP, AVIF, TIFF, GIF. SVG input rasterises to PNG.

## Commands

```bash
npm run dev       # Start Vite dev server + Electron (hot reload)
npm run typecheck # tsc --noEmit for both renderer (tsconfig.json) and electron/vite (tsconfig.node.json)
npm test          # vitest run (pure-function unit tests; config is vitest.config.ts, NOT vite.config.ts)
npm run build     # typecheck + Vite production build (renderer + main + preload)
npm run package   # Build + create platform installer (electron-builder)
```

App icons live in `build/` (`icon.png`/`icon.icns`/`icon.ico`, source `icon.svg`) and are wired into electron-builder per platform.

## Architecture

**Process model** — Electron's main/renderer split with IPC bridge:

- `electron/threadpool.ts` — sizes `UV_THREADPOOL_SIZE` before Sharp runs; imported first from `main.ts`. Sharp's encoders are libuv threadpool tasks and the default pool of 4 caps `MAX_CONCURRENCY` at 4 regardless of its value
- `electron/main.ts` — Electron main process: window creation, IPC handlers for file dialogs and image processing
- `electron/preload.ts` — Context bridge exposing `window.api` to renderer (contextIsolation enabled)
- `electron/imageProcessor.ts` — Sharp-based processing: resize, format conversion, quality control, batch execution with progress callbacks
- `electron/outputPath.ts` — filename sanitising, extension mapping, and per-batch output path reservation (collision handling). Pure and unit-tested
- `electron/windowState.ts` — persists window size/position/maximised state under `app.getPath('userData')`; drops a restored position that no longer overlaps a connected display
- `src/utils/` — shared renderer helpers (size/duration formatting, IPC error messages, settings persistence), unit-tested
- `src/` — React renderer (Vite-bundled): App state manages file list, settings, processing lifecycle

**IPC channels**: `select-files`, `select-output-dir`, `get-image-info`, `get-supported-extensions`, `directory-exists`, `process-images`, `cancel-processing`, `process-progress` (main→renderer)

Resize/output settings persist to `localStorage` via `src/utils/settingsStore.ts`. Stored values are treated as untrusted and coerced back into range on load, so settings written by an older build (or edited by hand) degrade to defaults instead of reaching Sharp as invalid options. A restored output folder is re-checked via `directory-exists` and cleared if it has gone.

Batches are cancellable: `processImages` takes a `shouldCancel` predicate checked before each file is claimed, so the in-flight encode finishes and no new work starts. It also fires when the window closes mid-batch. A cancelled run returns only the results it completed, and the renderer marks both panels `inert` while a batch is in flight because the batch runs off a snapshot taken at start.

Accepted input extensions are derived at runtime from `sharp.format` rather than hard-coded, so the file dialog and drop zone cannot advertise a format this build cannot decode (the prebuilt libvips has no HEVC decoder, so `.heic`/`.heif` are correctly absent).

`vitest.config.ts` exists separately because `vite.config.ts` loads `vite-plugin-electron`, which would spawn Electron on every test run.

**Build pipeline** — `vite-plugin-electron` compiles both main and preload TS into `dist-electron/`, while Vite builds renderer to `dist/`. Sharp is externalized from the bundle as a native module.

electron-builder writes installers to `release/`, which must stay **outside** the globs in `build.files` (`dist/**/*`, `dist-electron/**/*`). electron-builder extracts the Electron runtime into its output directory *before* packing `app.asar`, so pointing its output back at `dist/` makes the app pack a copy of Electron into itself.

## Key Types

All shared types live in `src/types.ts`: `ImageFileInfo`, `ResizeOptions`, `OutputOptions`, `ProcessingResult`, `ProcessingProgress`, `ElectronAPI` (global `window.api`).

## Sharp Native Module

Sharp is a native Node.js addon. When modifying electron-builder config or upgrading Electron, ensure native module rebuilding works (`electron-rebuild` if needed). Sharp is externalized in `vite.config.ts` rollupOptions.
