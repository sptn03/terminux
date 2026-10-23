import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { ipcMain } from './ipc-bus'
import { getDb } from '../db'
import { encryptString, decryptString } from '../crypto'
import { getSessionLogsDir } from '../paths'

export function registerAppIpc(): void {
  ipcMain.handle('app:listThemes', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM terminal_themes ORDER BY is_builtin DESC, name ASC').all()
  })

  // Handled in the browser (navigator.clipboard) — channel kept for parity.
  ipcMain.handle('app:copyToClipboard', () => {
    /* client-side */
  })

  // A browser cannot open a native file dialog; the client shows an in-app
  // picker that browses the server filesystem instead.
  ipcMain.handle('app:selectFile', () => null)

  ipcMain.handle('app:encryptPassword', (_event, plaintext: string) => {
    try {
      return encryptString(plaintext)
    } catch (err: any) {
      console.error('[terminux] encryptPassword failed:', err.message)
      return plaintext
    }
  })

  ipcMain.handle('app:decryptPassword', (_event, encrypted: string) => {
    try {
      return decryptString(encrypted)
    } catch {
      // Not encrypted with this server's key (or legacy plaintext)
      return encrypted
    }
  })

  // Window controls have no meaning in a browser tab.
  ipcMain.handle('app:minimize', () => {})
  ipcMain.handle('app:maximize', () => {})
  ipcMain.handle('app:close', () => {})
  ipcMain.handle('app:isMaximized', () => false)

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
    const logFilePath = join(getSessionLogsDir(), `${sessionId}.log`)
    if (existsSync(logFilePath)) {
      try {
        return readFileSync(logFilePath, 'utf-8')
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
      const logsDir = getSessionLogsDir()
      if (existsSync(logsDir)) {
        for (const file of readdirSync(logsDir)) {
          try {
            unlinkSync(join(logsDir, file))
          } catch {}
        }
      }
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}
