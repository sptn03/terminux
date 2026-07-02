import { contextBridge, ipcRenderer } from 'electron'

const api = {
  ssh: {
    connect: (config: {
      host: string
      port: number
      username: string
      authMethod: 'password' | 'key' | 'agent'
      password?: string
      privateKeyPath?: string
      passphrase?: string
      sessionId?: string
    }): Promise<{ sessionId: string; error?: string }> => {
      return ipcRenderer.invoke('ssh:connect', config)
    },
    shellInput: (sessionId: string, data: string): void => {
      ipcRenderer.send('ssh:shell-input', sessionId, data)
    },
    shellResize: (sessionId: string, cols: number, rows: number): void => {
      ipcRenderer.send('ssh:shell-resize', sessionId, cols, rows)
    },
    disconnect: (sessionId: string): Promise<void> => {
      return ipcRenderer.invoke('ssh:disconnect', sessionId)
    },
    exec: (sessionId: string, cmd: string): Promise<{ stdout: string; stderr: string; code: number }> => {
      return ipcRenderer.invoke('ssh:exec', sessionId, cmd)
    },
    onOutput: (callback: (sessionId: string, data: string) => void): (() => void) => {
      const handler = (_: any, sessionId: string, data: string) => callback(sessionId, data)
      ipcRenderer.on('shell:output', handler)
      return () => ipcRenderer.removeListener('shell:output', handler)
    },
    onExit: (callback: (sessionId: string, code: number | null) => void): (() => void) => {
      const handler = (_: any, sessionId: string, code: number | null) => callback(sessionId, code)
      ipcRenderer.on('shell:exit', handler)
      return () => ipcRenderer.removeListener('shell:exit', handler)
    },
    onError: (callback: (sessionId: string, error: string) => void): (() => void) => {
      const handler = (_: any, sessionId: string, error: string) => callback(sessionId, error)
      ipcRenderer.on('shell:error', handler)
      return () => ipcRenderer.removeListener('shell:error', handler)
    }
  },
  db: {
    all: (sql: string, params?: any[]): Promise<any[]> => {
      return ipcRenderer.invoke('db:all', sql, params ?? [])
    },
    run: (sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> => {
      return ipcRenderer.invoke('db:run', sql, params ?? [])
    },
    get: (sql: string, params?: any[]): Promise<any> => {
      return ipcRenderer.invoke('db:get', sql, params ?? [])
    }
  },
  app: {
    listThemes: (): Promise<Array<{ id: string; name: string; isBuiltin: number; config: string }>> => {
      return ipcRenderer.invoke('app:listThemes')
    },
    copyToClipboard: (text: string): Promise<void> => {
      return ipcRenderer.invoke('app:copyToClipboard', text)
    },
    selectFile: (filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> => {
      return ipcRenderer.invoke('app:selectFile', filters)
    },
    encryptPassword: (plaintext: string): Promise<string> => {
      return ipcRenderer.invoke('app:encryptPassword', plaintext)
    },
    decryptPassword: (encrypted: string): Promise<string> => {
      return ipcRenderer.invoke('app:decryptPassword', encrypted)
    }
  },
  sftp: {
    listDir: (sessionId: string, dirPath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:listDir', sessionId, dirPath)
    },
    listDirRecursive: (sessionId: string, dirPath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:listDirRecursive', sessionId, dirPath)
    },
    deleteFile: (sessionId: string, filePath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:deleteFile', sessionId, filePath)
    },
    deleteDir: (sessionId: string, dirPath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:deleteDir', sessionId, dirPath)
    },
    mkdir: (sessionId: string, dirPath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:mkdir', sessionId, dirPath)
    },
    rename: (sessionId: string, oldPath: string, newPath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:rename', sessionId, oldPath, newPath)
    },
    upload: (sessionId: string, remotePath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:upload', sessionId, remotePath)
    },
    download: (sessionId: string, remotePath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:download', sessionId, remotePath)
    },
    readFile: (sessionId: string, remotePath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:readFile', sessionId, remotePath)
    },
    deploy: (sessionId: string, localDir: string, remoteDir: string, filePaths?: string[], taskId?: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:deploy', sessionId, localDir, remoteDir, filePaths, taskId)
    },
    downloadFiles: (sessionId: string, remotePaths: string[], targetLocalDir?: string, taskId?: string): Promise<{ downloaded: number; total: number; errors: string[]; canceled?: boolean }> => {
      return ipcRenderer.invoke('sftp:downloadFiles', sessionId, remotePaths, targetLocalDir, taskId)
    },
    duplicate: (sessionId: string, remotePath: string): Promise<{ success?: boolean; error?: string; path?: string }> => {
      return ipcRenderer.invoke('sftp:duplicate', sessionId, remotePath)
    },
    move: (sessionId: string, oldPath: string, newPath: string): Promise<{ success?: boolean; error?: string }> => {
      return ipcRenderer.invoke('sftp:move', sessionId, oldPath, newPath)
    },
    writeFile: (sessionId: string, remotePath: string, content: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:writeFile', sessionId, remotePath, content)
    },
    zip: (sessionId: string, targetPath: string, outputPath: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:zip', sessionId, targetPath, outputPath)
    },
    unzip: (sessionId: string, zipPath: string, targetDir: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:unzip', sessionId, zipPath, targetDir)
    },
    cancelTask: (taskId: string): Promise<any> => {
      return ipcRenderer.invoke('sftp:cancelTask', taskId)
    },
    onProgress: (callback: (data: { taskId: string; progress: number; speed: string; detail: string }) => void): (() => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('sftp:progress', handler)
      return () => ipcRenderer.removeListener('sftp:progress', handler)
    },
    chmod: (sessionId: string, remotePath: string, mode: number): Promise<any> => {
      return ipcRenderer.invoke('sftp:chmod', sessionId, remotePath, mode)
    }
  },
  local: {
    listDir: (dirPath: string): Promise<any> => {
      return ipcRenderer.invoke('local:listDir', dirPath)
    },
    selectDir: (): Promise<string | null> => {
      return ipcRenderer.invoke('local:selectDir')
    },
    getDrives: (): Promise<any> => {
      return ipcRenderer.invoke('local:getDrives')
    },
    mkdir: (dirPath: string): Promise<any> => {
      return ipcRenderer.invoke('local:mkdir', dirPath)
    },
    rename: (oldPath: string, newPath: string): Promise<any> => {
      return ipcRenderer.invoke('local:rename', oldPath, newPath)
    },
    delete: (targetPath: string): Promise<any> => {
      return ipcRenderer.invoke('local:delete', targetPath)
    },
    writeFile: (filePath: string, content: string): Promise<any> => {
      return ipcRenderer.invoke('local:writeFile', filePath, content)
    },
    zip: (targetPath: string, outputPath: string): Promise<any> => {
      return ipcRenderer.invoke('local:zip', targetPath, outputPath)
    },
    unzip: (zipPath: string, targetDir: string): Promise<any> => {
      return ipcRenderer.invoke('local:unzip', zipPath, targetDir)
    },
    watchDir: (dirPath: string, watchId: string): Promise<any> => {
      return ipcRenderer.invoke('local:watchDir', dirPath, watchId)
    },
    unwatchDir: (watchId: string): Promise<any> => {
      return ipcRenderer.invoke('local:unwatchDir', watchId)
    },
    onFileChanged: (callback: (data: { watchId: string; localPath: string; relativePath: string }) => void): (() => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('local:file-changed', handler)
      return () => ipcRenderer.removeListener('local:file-changed', handler)
    }
  },
  tunnel: {
    startLocal: (sessionId: string, name: string, localPort: number, remoteHost: string, remotePort: number): Promise<any> => {
      return ipcRenderer.invoke('tunnel:startLocal', sessionId, name, localPort, remoteHost, remotePort)
    },
    startRemote: (sessionId: string, name: string, remotePort: number, localHost: string, localPort: number): Promise<any> => {
      return ipcRenderer.invoke('tunnel:startRemote', sessionId, name, remotePort, localHost, localPort)
    },
    stop: (id: string): Promise<any> => {
      return ipcRenderer.invoke('tunnel:stop', id)
    },
    list: (): Promise<any> => {
      return ipcRenderer.invoke('tunnel:list')
    }
  },
  port: {
    scan: (sessionId: string): Promise<any> => {
      return ipcRenderer.invoke('port:scan', sessionId)
    }
  },
  history: {
    list: (): Promise<any[]> => {
      return ipcRenderer.invoke('history:list')
    },
    readLog: (sessionId: string): Promise<string> => {
      return ipcRenderer.invoke('history:readLog', sessionId)
    },
    clear: (): Promise<any> => {
      return ipcRenderer.invoke('history:clear')
    }
  },
  window: {
    minimize: () => ipcRenderer.invoke('app:minimize'),
    maximize: () => ipcRenderer.invoke('app:maximize'),
    close: () => ipcRenderer.invoke('app:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('app:isMaximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const handler = (_: any, maximized: boolean) => callback(maximized)
      ipcRenderer.on('window:maximized-changed', handler)
      return () => ipcRenderer.removeListener('window:maximized-changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
