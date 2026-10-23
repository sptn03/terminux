import { basename, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { getDataDir } from './paths'

/**
 * Staging directory for files the browser downloads.
 *
 * The browser cannot write to the server filesystem directly, so remote files
 * pulled over SFTP are first written here and then streamed to the client
 * through GET /api/download. Only files inside this directory may be served.
 */
export function getDownloadDir(): string {
  const dir = join(getDataDir(), 'downloads')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Builds the client-facing URL for a file inside the download directory. */
export function downloadUrlFor(filePath: string, name?: string): string {
  const filename = basename(name || filePath)
  return `/api/download?file=${encodeURIComponent(filename)}`
}

/** Resolves a client supplied `?file=` value, refusing path traversal. */
export function resolveDownloadPath(requested: string): string | null {
  const filename = basename(requested)
  if (!filename || filename !== requested.replace(/\\/g, '/').split('/').pop()) return null
  const full = join(getDownloadDir(), filename)
  return existsSync(full) ? full : null
}
