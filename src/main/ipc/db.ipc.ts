import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerDbIpc(): void {
  ipcMain.handle('db:all', (_event, sql: string, params: any[]) => {
    try {
      const db = getDb()
      const stmt = db.prepare(sql)
      return stmt.all(...params)
    } catch (err: any) {
      console.error('db:all error:', err.message)
      throw err
    }
  })

  ipcMain.handle('db:run', (_event, sql: string, params: any[]) => {
    try {
      const db = getDb()
      const stmt = db.prepare(sql)
      const result = stmt.run(...params)
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
    } catch (err: any) {
      console.error('db:run error:', err.message)
      throw err
    }
  })

  ipcMain.handle('db:get', (_event, sql: string, params: any[]) => {
    try {
      const db = getDb()
      const stmt = db.prepare(sql)
      return stmt.get(...params) ?? null
    } catch (err: any) {
      console.error('db:get error:', err.message)
      throw err
    }
  })
}
