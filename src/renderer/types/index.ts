export interface Host {
  id: string
  name: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key' | 'agent'
  password: string | null
  privateKeyPath: string | null
  passphrase: string | null
  groupId: string | null
  color: string | null
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Group {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  children?: Group[]
  hosts?: Host[]
}

export interface Snippet {
  id: string
  name: string
  command: string
  description: string
  category: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TerminalTheme {
  id: string
  name: string
  isBuiltin: number
  config: string
}

export interface ThemeConfig {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface TerminalTab {
  sessionId: string
  hostId: string
  label: string
  connected: boolean
  loading: boolean
  themeId?: string
  config?: any
  viewMode?: 'terminal' | 'dashboard'
  alertStatus?: 'normal' | 'warning' | 'danger'
  startupCommand?: string
}

declare global {
  interface Window {
    api: {
      ssh: {
        connect: (config: {
          host: string
          port: number
          username: string
          authMethod: string
          password?: string
          privateKeyPath?: string
          passphrase?: string
          sessionId?: string
        }) => Promise<{ sessionId: string; error?: string }>
        shellInput: (sessionId: string, data: string) => void
        shellResize: (sessionId: string, cols: number, rows: number) => void
        disconnect: (sessionId: string) => Promise<void>
        exec: (sessionId: string, cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
        onOutput: (callback: (sessionId: string, data: string) => void) => () => void
        onExit: (callback: (sessionId: string, code: number | null) => void) => () => void
        onError: (callback: (sessionId: string, error: string) => void) => () => void
      }
      db: {
        all: (sql: string, params?: any[]) => Promise<any[]>
        run: (sql: string, params?: any[]) => Promise<{ changes: number; lastInsertRowid: number | bigint }>
        get: (sql: string, params?: any[]) => Promise<any>
      }
      app: {
        listThemes: () => Promise<TerminalTheme[]>
        copyToClipboard: (text: string) => Promise<void>
        selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
        encryptPassword: (plaintext: string) => Promise<string>
        decryptPassword: (encrypted: string) => Promise<string>
      }
      sftp: {
        listDir: (sessionId: string, dirPath: string) => Promise<any>
        listDirRecursive: (sessionId: string, dirPath: string) => Promise<any>
        deleteFile: (sessionId: string, filePath: string) => Promise<any>
        deleteDir: (sessionId: string, dirPath: string) => Promise<any>
        mkdir: (sessionId: string, dirPath: string) => Promise<any>
        rename: (sessionId: string, oldPath: string, newPath: string) => Promise<any>
        upload: (sessionId: string, remotePath: string) => Promise<any>
        uploadFiles: (sessionId: string, remotePath: string, files: File[]) => Promise<any>
        download: (sessionId: string, remotePath: string) => Promise<any>
        readFile: (sessionId: string, remotePath: string) => Promise<{ content?: string; isText?: boolean; error?: string }>
        deploy: (sessionId: string, localDir: string, remoteDir: string, filePaths?: string[], taskId?: string) => Promise<{ uploaded: number; total: number; errors: string[]; canceled?: boolean }>
        downloadFiles: (sessionId: string, remotePaths: string[], targetLocalDir?: string, taskId?: string) => Promise<{ downloaded: number; total: number; errors: string[]; canceled?: boolean }>
        duplicate: (sessionId: string, remotePath: string) => Promise<{ success?: boolean; error?: string; path?: string }>
        move: (sessionId: string, oldPath: string, newPath: string) => Promise<{ success?: boolean; error?: string }>
        writeFile: (sessionId: string, remotePath: string, content: string) => Promise<{ success?: boolean; error?: string }>
        zip: (sessionId: string, targetPath: string, outputPath: string) => Promise<{ success?: boolean; error?: string }>
        unzip: (sessionId: string, zipPath: string, targetDir: string) => Promise<{ success?: boolean; error?: string }>
        cancelTask: (taskId: string) => Promise<any>
        onProgress: (callback: (data: { taskId: string; progress: number; speed: string; detail: string }) => void) => () => void
        chmod: (sessionId: string, remotePath: string, mode: number) => Promise<{ success?: boolean; error?: string }>
      }
      local: {
        listDir: (dirPath: string) => Promise<LocalEntry[]>
        selectDir: () => Promise<string | null>
        readFile: (filePath: string) => Promise<{ content?: string; isText?: boolean; error?: string }>
        getDrives: () => Promise<{ name: string; path: string; isDirectory: boolean }[]>
        mkdir: (dirPath: string) => Promise<{ success?: boolean; error?: string }>
        rename: (oldPath: string, newPath: string) => Promise<{ success?: boolean; error?: string }>
        delete: (targetPath: string) => Promise<{ success?: boolean; error?: string }>
        writeFile: (filePath: string, content: string) => Promise<{ success?: boolean; error?: string }>
        zip: (targetPath: string, outputPath: string) => Promise<{ success?: boolean; error?: string }>
        unzip: (zipPath: string, targetDir: string) => Promise<{ success?: boolean; error?: string }>
        watchDir: (dirPath: string, watchId: string) => Promise<{ success?: boolean; error?: string }>
        unwatchDir: (watchId: string) => Promise<{ success?: boolean; error?: string }>
        onFileChanged: (callback: (data: { watchId: string; localPath: string; relativePath: string }) => void) => () => void
      }
      tunnel: {
        startLocal: (sessionId: string, name: string, localPort: number, remoteHost: string, remotePort: number) => Promise<any>
        startRemote: (sessionId: string, name: string, remotePort: number, localHost: string, localPort: number) => Promise<any>
        stop: (id: string) => Promise<any>
        list: () => Promise<any[]>
      }
      port: {
        scan: (sessionId: string) => Promise<number[] | { error: string }>
      }
      history: {
        list: () => Promise<any[]>
        readLog: (sessionId: string) => Promise<string>
        clear: () => Promise<{ success?: boolean; error?: string }>
      }
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
        onMaximizedChange: (callback: (maximized: boolean) => void) => () => void
      }
    }
  }
}

export interface LocalEntry {
  name: string
  path: string
  size: number
  isDirectory: boolean
  isFile: boolean
  modifiedAt: string
}
