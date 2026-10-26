import { readdirSync, statSync, mkdirSync, renameSync, unlinkSync, rmSync, readFileSync, writeFileSync, watch, existsSync } from 'fs'
import { join, basename } from 'path'
import AdmZip from 'adm-zip'
import { ipcMain, broadcast } from './ipc-bus'
import { assertInsideFsRoot } from '../paths'

export interface LocalEntry {
  name: string
  path: string
  size: number
  isDirectory: boolean
  isFile: boolean
  modifiedAt: string
}

function listLocalDir(dirPath: string): LocalEntry[] {
  try {
    const safeDir = assertInsideFsRoot(dirPath)
    const items = readdirSync(safeDir, { withFileTypes: true })
    const entries: LocalEntry[] = []
    for (const item of items) {
      if (item.name.startsWith('.')) continue
      try {
        const fullPath = join(safeDir, item.name)
        const stat = statSync(fullPath)
        entries.push({
          name: item.name,
          path: fullPath,
          size: stat.size,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          modifiedAt: stat.mtime.toISOString()
        })
      } catch {}
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return entries
  } catch { return [] }
}

export function registerLocalIpc(): void {
  ipcMain.handle('local:listDir', async (_event, dirPath: string) => {
    return listLocalDir(dirPath)
  })

  // No native dialog in a browser — the client shows its own directory picker.
  ipcMain.handle('local:selectDir', async () => null)

  // Read a file that lives on the machine running the server.
  ipcMain.handle('local:readFile', async (_event, filePath: string) => {
    try {
      const buffer = readFileSync(assertInsideFsRoot(filePath))
      if (buffer.includes(0)) return { isText: false }
      return { content: buffer.toString('utf-8'), isText: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('local:getDrives', async () => {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process')
      try {
        let drives: string[] = []
        try {
          const output = execSync('fsutil fsinfo drives', { encoding: 'utf8', timeout: 2000, stdio: 'pipe' })
          drives = output
            .replace(/^Drives:\s*/i, '')
            .split(/\s+/)
            .map((d: string) => d.trim())
            .filter(Boolean)
        } catch {
          const output = execSync('powershell -Command "[System.IO.DriveInfo]::GetDrives().Name"', { encoding: 'utf8', timeout: 2000, stdio: 'pipe' })
          drives = output
            .split('\n')
            .map((d: string) => d.trim())
            .filter(Boolean)
        }

        if (drives.length > 0) {
          return drives.map((d: string) => {
            const formatted = d.endsWith('\\') ? d : d + '\\'
            return {
              name: d.endsWith('\\') ? d.slice(0, -1) : d,
              path: formatted,
              isDirectory: true
            }
          })
        }
      } catch {}

      // Fallback
      return ['C:\\', 'D:\\'].filter((d) => {
        try { readdirSync(d); return true } catch { return false }
      }).map((d) => ({ name: d.endsWith('\\') ? d.slice(0, -1) : d, path: d, isDirectory: true }))
    }
    return [{ name: '/', path: '/', isDirectory: true }]
  })

  ipcMain.handle('local:mkdir', async (_event, dirPath: string) => {
    try {
      mkdirSync(assertInsideFsRoot(dirPath), { recursive: true })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('local:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      renameSync(assertInsideFsRoot(oldPath), assertInsideFsRoot(newPath))
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('local:delete', async (_event, targetPath: string) => {
    try {
      const safePath = assertInsideFsRoot(targetPath)
      const stat = statSync(safePath)
      if (stat.isDirectory()) {
        rmSync(safePath, { recursive: true, force: true })
      } else {
        unlinkSync(safePath)
      }
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Write local file content
  ipcMain.handle('local:writeFile', async (_event, filePath: string, content: string) => {
    try {
      writeFileSync(assertInsideFsRoot(filePath), content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Zip a file or directory locally
  ipcMain.handle('local:zip', async (_event, targetPath: string, outputPath: string) => {
    try {
      const safeTarget = assertInsideFsRoot(targetPath)
      const safeOutput = assertInsideFsRoot(outputPath)
      const zip = new AdmZip()
      const stat = statSync(safeTarget)
      if (stat.isDirectory()) {
        zip.addLocalFolder(safeTarget)
      } else {
        zip.addLocalFile(safeTarget)
      }
      zip.writeZip(safeOutput)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Unzip a zip file locally
  ipcMain.handle('local:unzip', async (_event, zipPath: string, targetDir: string) => {
    try {
      const zip = new AdmZip(assertInsideFsRoot(zipPath))
      zip.extractAllTo(assertInsideFsRoot(targetDir), true)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Watch directory changes for Auto-Sync
  const activeWatchers = new Map<string, any>()

  ipcMain.handle('local:watchDir', async (_event, dirPath: string, watchId: string) => {
    try {
      const safeDir = assertInsideFsRoot(dirPath)

      if (activeWatchers.has(watchId)) {
        activeWatchers.get(watchId).close()
      }

      // Simple recursive folder watcher or single folder watcher
      let debounceTimeout: any = null
      const watcher = watch(safeDir, { recursive: true }, (eventType: string, filename: string | null) => {
        if (!filename) return

        // Debounce to prevent rapid fire uploads
        if (debounceTimeout) clearTimeout(debounceTimeout)
        debounceTimeout = setTimeout(() => {
          const fullLocalPath = join(safeDir, filename).replace(/\\/g, '/')
          try {
            if (existsSync(fullLocalPath) && statSync(fullLocalPath).isFile()) {
              broadcast('local:file-changed', {
                watchId,
                localPath: fullLocalPath,
                relativePath: filename.replace(/\\/g, '/')
              })
            }
          } catch {}
        }, 1000)
      })

      activeWatchers.set(watchId, watcher)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('local:unwatchDir', async (_event, watchId: string) => {
    const watcher = activeWatchers.get(watchId)
    if (watcher) {
      watcher.close()
      activeWatchers.delete(watchId)
      return { success: true }
    }
    return { error: 'Không tìm thấy watcher' }
  })
}
