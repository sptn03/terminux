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
        const output = execSync('wmic logicaldisk get caption', { encoding: 'utf8', timeout: 2000 })
        return output.split('\n').slice(1).map((l: string) => l.trim()).filter(Boolean).map((d: string) => ({
          name: d,
          path: d + '\\',
          isDirectory: true
        }))
      } catch {
        return ['C:\\', 'D:\\'].filter((d) => {
          try { readdirSync(d); return true } catch { return false }
        }).map((d) => ({ name: d, path: d, isDirectory: true }))
      }
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
