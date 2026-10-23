import { join, resolve, sep } from 'path'
import { existsSync, mkdirSync, rmSync } from 'fs'

/**
 * Server-side data directory.
 *
 * Replaces Electron's `app.getPath('userData')`.
 * Override with TERMINUX_DATA_DIR (absolute or relative to cwd).
 */
export function getDataDir(): string {
  const dir = process.env['TERMINUX_DATA_DIR'] || join(process.cwd(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getDbDir(): string {
  const dir = join(getDataDir(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getSessionLogsDir(): string {
  const dir = join(getDataDir(), 'session_logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getTempDir(): string {
  const dir = join(getDataDir(), 'tmp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Optional filesystem jail. When TERMINUX_FS_ROOT is set, every path used by
 * the local-filesystem API must stay inside that root (path traversal guard).
 */
export function getFsRoot(): string | null {
  const root = process.env['TERMINUX_FS_ROOT']
  return root ? resolve(root) : null
}

export function assertInsideFsRoot(targetPath: string): string {
  const root = getFsRoot()
  const resolved = resolve(targetPath)
  if (!root) return resolved
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error('Đường dẫn nằm ngoài thư mục được phép')
  }
  return resolved
}

export function cleanupTempDir(): void {
  try {
    rmSync(getTempDir(), { recursive: true, force: true })
  } catch { /* ignore */ }
}
