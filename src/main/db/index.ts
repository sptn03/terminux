import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { CREATE_TABLES, DEFAULT_SETTINGS, BUILTIN_THEMES } from './schema'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = join(dbDir, 'terminux.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run migrations
  db.exec(CREATE_TABLES)

  // Seed default settings if not exist
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)'
  )
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value)
  }

  // Seed built-in themes if not exist (using REPLACE to auto-sync new additions)
  const insertTheme = db.prepare(
    'INSERT OR REPLACE INTO terminal_themes (id, name, is_builtin, config) VALUES (?, ?, ?, ?)'
  )
  for (const theme of BUILTIN_THEMES) {
    insertTheme.run(theme.id, theme.name, theme.is_builtin, theme.config)
  }

  console.log(`Database initialized at ${dbPath}`)
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
