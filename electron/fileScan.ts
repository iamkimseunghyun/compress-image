import fs from 'node:fs/promises'
import path from 'node:path'

/** Same ceiling as the batch limit — there is no point collecting more. */
export const MAX_SCANNED_FILES = 10_000

/** Deep enough for any real photo library, shallow enough to end. */
const MAX_DEPTH = 8

/**
 * Suffix match rather than the last dot-segment, because Sharp reports compound
 * suffixes such as `svg.gz`, which `split('.').pop()` would read as `gz`.
 */
export function isSupportedFile(filePath: string, extensions: string[]): boolean {
  const name = path.basename(filePath).toLowerCase()
  return extensions.some((ext) => name.endsWith(`.${ext}`))
}

/**
 * Turns whatever was dropped or picked into a flat list of readable image files:
 * directories are walked, unsupported files dropped, duplicates removed.
 *
 * Order is stable (directories before their contents, each level sorted) because
 * the rename option numbers files by position — a batch that scanned in
 * filesystem order would number differently on every run.
 */
export async function expandPaths(inputs: string[], extensions: string[]): Promise<string[]> {
  const found: string[] = []
  const visitedDirs = new Set<string>()

  async function walk(target: string, depth: number): Promise<void> {
    if (found.length >= MAX_SCANNED_FILES) return

    let stats
    try {
      stats = await fs.stat(target)
    } catch {
      // Unreadable or vanished between drop and scan; skip rather than fail the lot.
      return
    }

    if (stats.isFile()) {
      if (isSupportedFile(target, extensions)) found.push(target)
      return
    }

    if (!stats.isDirectory() || depth >= MAX_DEPTH) return

    // Symlinked or repeated directories would otherwise loop forever.
    const real = await fs.realpath(target).catch(() => target)
    if (visitedDirs.has(real)) return
    visitedDirs.add(real)

    let entries
    try {
      entries = await fs.readdir(target, { withFileTypes: true })
    } catch {
      return
    }

    const names = entries
      // Skip dot-directories (.git, .Trash) but keep dot-files that are images.
      .filter((e) => !(e.isDirectory() && e.name.startsWith('.')))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))

    for (const name of names) {
      await walk(path.join(target, name), depth + 1)
    }
  }

  for (const input of inputs) {
    await walk(input, 0)
  }

  return [...new Set(found)].slice(0, MAX_SCANNED_FILES)
}
