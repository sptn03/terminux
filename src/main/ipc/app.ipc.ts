import { ipcMain, clipboard, dialog, safeStorage, BrowserWindow, app } from 'electron'
import { getDb } from '../db'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(w: BrowserWindow): void {
  mainWindow = w
}

export function registerAppIpc(): void {
  ipcMain.handle('app:listThemes', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM terminal_themes ORDER BY is_builtin DESC, name ASC').all()
  })

  ipcMain.handle('app:copyToClipboard', (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('app:selectFile', async (_event, filters?: Array<{ name: string; extensions: string[] }>) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }]
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('app:encryptPassword', (_event, plaintext: string) => {
    if (!safeStorage.isEncryptionAvailable()) return plaintext
    const encrypted = safeStorage.encryptString(plaintext)
    return encrypted.toString('base64')
  })

  ipcMain.handle('app:decryptPassword', (_event, encrypted: string) => {
    if (!safeStorage.isEncryptionAvailable()) return encrypted
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return encrypted
    }
  })

  // Window controls
  ipcMain.handle('app:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('app:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('app:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('app:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  // History logs handlers
  ipcMain.handle('history:list', () => {
    try {
      const db = getDb()
      return db.prepare('SELECT * FROM session_history ORDER BY started_at DESC').all()
    } catch (err) {
      console.error(err)
      return []
    }
  })

  ipcMain.handle('history:readLog', (_event, sessionId: string) => {
    const fs = require('fs')
    const path = require('path')
    const userDataPath = app.getPath('userData')
    const logFilePath = path.join(userDataPath, 'session_logs', `${sessionId}.log`)
    if (fs.existsSync(logFilePath)) {
      try {
        return fs.readFileSync(logFilePath, 'utf-8')
      } catch (err: any) {
        return `Lỗi đọc nhật ký: ${err.message}`
      }
    }
    return 'Không tìm thấy dữ liệu nhật ký cho phiên này.'
  })

  ipcMain.handle('history:clear', () => {
    try {
      const db = getDb()
      db.prepare('DELETE FROM session_history').run()
      const fs = require('fs')
      const path = require('path')
      const userDataPath = app.getPath('userData')
      const logsDir = path.join(userDataPath, 'session_logs')
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir)
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(logsDir, file))
          } catch {}
        }
      }
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}
