import { ipcMain, dialog } from 'electron'
import { readdirSync, statSync, mkdirSync, renameSync, unlinkSync, rmSync } from 'fs'
import { join, basename } from 'path'

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
    const items = readdirSync(dirPath, { withFileTypes: true })
    const entries: LocalEntry[] = []
    for (const item of items) {
      if (item.name.startsWith('.')) continue
      try {
        const fullPath = join(dirPath, item.name)
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

  ipcMain.handle('local:selectDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
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
      mkdirSync(dirPath, { recursive: true })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('local:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      renameSync(oldPath, newPath)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('local:delete', async (_event, targetPath: string) => {
    try {
      const stat = statSync(targetPath)
      if (stat.isDirectory()) {
        rmSync(targetPath, { recursive: true, force: true })
      } else {
        unlinkSync(targetPath)
      }
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Write local file content
  ipcMain.handle('local:writeFile', async (_event, filePath: string, content: string) => {
    try {
      require('fs').writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}
