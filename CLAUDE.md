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
- `electron/ipcValidation.ts` — parses/clamps the `process-images` payload before the main process acts on it. Throws where there is no safe default (missing or relative output directory), clamps everything else. Pure and unit-tested
- `electron/fileScan.ts` — walks dropped or picked directories into a flat, stably-ordered list of decodable files. Pure-ish and unit-tested
- `src/utils/` — shared renderer helpers (size/duration formatting, IPC error messages, settings persistence, output-size projection), unit-tested
- `src/hooks/useOutputEstimate.ts` — debounced size estimate; supersedes stale responses by sequence number and re-runs only when a size-affecting setting changes
- `src/` — React renderer (Vite-bundled): App state manages file list, settings, processing lifecycle

**IPC channels**: `select-files`, `select-directory`, `expand-paths`, `select-output-dir`, `get-image-info`, `get-supported-extensions`, `directory-exists`, `open-path`, `show-item-in-folder`, `show-error`, `process-images`, `cancel-processing`, `process-progress` (main→renderer)

Dropped paths go straight to `expand-paths`: only the main process can tell a folder from a file or walk it, so the renderer does no extension filtering of its own.

Resize/output settings persist to `localStorage` via `src/utils/settingsStore.ts`. Stored values are treated as untrusted and coerced back into range on load, so settings written by an older build (or edited by hand) degrade to defaults instead of reaching Sharp as invalid options. A restored output folder is re-checked via `directory-exists` and cleared if it has gone.

**Output size estimate** — `estimate-sizes` encodes a few representative files to memory (never to disk) through `buildPipeline`, the same function the real run uses; a separate copy of that logic would drift out of agreement the first time either side changed. The projection is driven by **output pixels, not input bytes**, with bytes-per-pixel pooled per source format. That matters: scaling a batch by an input-byte ratio was off by −62% on a mixed batch, because a 4032px photo and a 640px one both land at 1280px while their inputs differ 30x, and PNG and JPEG bytes-per-pixel are nothing alike. Measured error after the change was +1.3% / −10.3% / −10.9% / +0.3% across four scenarios on a deliberately harsh batch. Samples are stratified by source format for the same reason. Keep the UI wording hedged (`약`, `표본 N개 기준`) — it is a projection, not a measurement.

Batches are cancellable: `processImages` takes a `shouldCancel` predicate checked before each file is claimed, so the in-flight encode finishes and no new work starts. It also fires when the window closes mid-batch. A cancelled run returns only the results it completed, and the renderer marks both panels `inert` while a batch is in flight because the batch runs off a snapshot taken at start.

Accepted input extensions are derived at runtime from `sharp.format` rather than hard-coded, so the file dialog and drop zone cannot advertise a format this build cannot decode (the prebuilt libvips has no HEVC decoder, so `.heic`/`.heif` are correctly absent).

`vitest.config.ts` exists separately because `vite.config.ts` loads `vite-plugin-electron`, which would spawn Electron on every test run.

**Build pipeline** — `vite-plugin-electron` compiles both main and preload TS into `dist-electron/`, while Vite builds renderer to `dist/`. Sharp is externalized from the bundle as a native module.

**Renderer hardening** — `sandbox: true` (the preload only needs `contextBridge`/`ipcRenderer`/`webUtils`, all available to a sandboxed preload), `setWindowOpenHandler` denies new windows, and a strict CSP `<meta>` is injected by a `csp-meta` Vite plugin that runs on build only — the dev server needs inline scripts and `eval` for HMR, so injecting it in dev would break `npm run dev`.

**Sharp and SVG** — do not add a `density` option to the main pipeline. Sharp re-renders a vector at the resize target, so SVG output is already sharp at any size (measured: the edge transitions over one pixel either way). Density only matters for the thumbnail, where `withoutEnlargement` otherwise pins an SVG to its declared size.

electron-builder writes installers to `release/`, which must stay **outside** the globs in `build.files` (`dist/**/*`, `dist-electron/**/*`). electron-builder extracts the Electron runtime into its output directory *before* packing `app.asar`, so pointing its output back at `dist/` makes the app pack a copy of Electron into itself.

`asarUnpack` names Sharp's native payload explicitly rather than relying on electron-builder's auto-detection of `.node` files, since `@img/sharp-libvips-*` ships `.dylib`/`.so` files that the heuristic does not cover.

`npm run package` builds only for the host architecture. An Intel build needs the matching Sharp binaries first — `npm run package:x64` installs them and builds in one step. Distribution additionally requires code signing and notarisation, which are **not** configured: without them macOS refuses the downloaded app.

## Key Types

All shared types live in `src/types.ts`: `ImageFileInfo`, `ResizeOptions`, `OutputOptions`, `ProcessingResult`, `ProcessingProgress`, `ElectronAPI` (global `window.api`).

## Sharp Native Module

Sharp is a native Node.js addon. When modifying electron-builder config or upgrading Electron, ensure native module rebuilding works (`electron-rebuild` if needed). Sharp is externalized in `vite.config.ts` rollupOptions.
