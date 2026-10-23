/**
 * Browser implementation of the `window.api` bridge.
 *
 * Replaces the Electron preload/contextBridge: request/response calls go to
 * POST /api/invoke, fire-and-forget calls (keystrokes, resizes) go over the
 * event WebSocket, and server pushes are delivered to the `on*` subscriptions.
 */
import type { LocalEntry, TerminalTheme } from '../types'

type EventHandler = (...args: any[]) => void

const handlers = new Map<string, Set<EventHandler>>()
let socket: WebSocket | null = null
let reconnectDelay = 500

function dispatch(channel: string, args: any[]): void {
  const set = handlers.get(channel)
  if (!set) return
  for (const handler of Array.from(set)) {
    try {
      handler(...args)
    } catch (err) {
      console.error(`[terminux] handler lỗi trên "${channel}"`, err)
    }
  }
}

function connectEvents(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  socket = new WebSocket(`${proto}//${location.host}/api/events`)

  socket.onopen = () => {
    reconnectDelay = 500
  }

  socket.onmessage = (event) => {
    let message: any
    try {
      message = JSON.parse(event.data as string)
    } catch {
      return
    }
    if (message?.type === 'event') dispatch(message.channel, message.args || [])
  }

  socket.onclose = () => {
    socket = null
    setTimeout(connectEvents, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 10000)
  }

  socket.onerror = () => {
    socket?.close()
  }
}

function on(channel: string, callback: EventHandler): () => void {
  let set = handlers.get(channel)
  if (!set) {
    set = new Set()
    handlers.set(channel, set)
  }
  set.add(callback)
  connectEvents()
  return () => set!.delete(callback)
}

async function invoke<T = any>(channel: string, args: any[] = []): Promise<T> {
  const response = await fetch('/api/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args })
  })
  const data = await response.json()
  if (!data.ok) throw new Error(data.error || `Yêu cầu "${channel}" thất bại`)
  return data.result as T
}

/** Fire-and-forget: WebSocket when available, HTTP otherwise. */
function send(channel: string, args: any[] = []): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'send', channel, args }))
    return
  }
  connectEvents()
  fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args })
  }).catch(() => {})
}

function triggerDownload(url: string): void {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** Opens the browser file picker (the server cannot show a native dialog). */
function pickFiles(multiple = true): Promise<File[]> {
  return new Promise((resolvePromise) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const files = Array.from(input.files || [])
      input.remove()
      resolvePromise(files)
    })
    input.addEventListener('cancel', () => {
      input.remove()
      resolvePromise([])
    })
    input.click()
  })
}

async function uploadToServer(file: File): Promise<{ path: string; name: string }> {
  const response = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file
  })
  const data = await response.json()
  if (!data.ok) throw new Error(data.error || 'Tải tệp lên máy chủ thất bại')
  return data
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch { /* fall through to the legacy path */ }

  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    document.execCommand('copy')
  } catch { /* ignore */ }
  area.remove()
}

const api = {
  ssh: {
    connect: (config: any): Promise<{ sessionId: string; error?: string }> => invoke('ssh:connect', [config]),
    shellInput: (sessionId: string, data: string): void => send('ssh:shell-input', [sessionId, data]),
    shellResize: (sessionId: string, cols: number, rows: number): void => send('ssh:shell-resize', [sessionId, cols, rows]),
    disconnect: (sessionId: string): Promise<void> => invoke('ssh:disconnect', [sessionId]),
    exec: (sessionId: string, cmd: string): Promise<{ stdout: string; stderr: string; code: number }> =>
      invoke('ssh:exec', [sessionId, cmd]),
    onOutput: (callback: (sessionId: string, data: string) => void) => on('shell:output', callback),
    onExit: (callback: (sessionId: string, code: number | null) => void) => on('shell:exit', callback),
    onError: (callback: (sessionId: string, error: string) => void) => on('shell:error', callback)
  },

  db: {
    all: (sql: string, params: any[] = []): Promise<any[]> => invoke('db:all', [sql, params]),
    run: (sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number | bigint }> =>
      invoke('db:run', [sql, params]),
    get: (sql: string, params: any[] = []): Promise<any> => invoke('db:get', [sql, params])
  },

  app: {
    listThemes: (): Promise<TerminalTheme[]> => invoke('app:listThemes'),
    copyToClipboard,
    // Picks a file that lives on the machine running the server.
    selectFile: async (): Promise<string | null> => {
      const { pickPath } = await import('./path-picker')
      return pickPath({ mode: 'file', title: 'Chọn tệp trên máy chủ' })
    },
    encryptPassword: (plaintext: string): Promise<string> => invoke('app:encryptPassword', [plaintext]),
    decryptPassword: (encrypted: string): Promise<string> => invoke('app:decryptPassword', [encrypted])
  },

  sftp: {
    listDir: (sessionId: string, dirPath: string): Promise<any> => invoke('sftp:listDir', [sessionId, dirPath]),
    listDirRecursive: (sessionId: string, dirPath: string): Promise<any> => invoke('sftp:listDirRecursive', [sessionId, dirPath]),
    deleteFile: (sessionId: string, filePath: string): Promise<any> => invoke('sftp:deleteFile', [sessionId, filePath]),
    deleteDir: (sessionId: string, dirPath: string): Promise<any> => invoke('sftp:deleteDir', [sessionId, dirPath]),
    mkdir: (sessionId: string, dirPath: string): Promise<any> => invoke('sftp:mkdir', [sessionId, dirPath]),
    rename: (sessionId: string, oldPath: string, newPath: string): Promise<any> => invoke('sftp:rename', [sessionId, oldPath, newPath]),
    // Browser → server temp dir → SFTP
    upload: async (sessionId: string, remotePath: string): Promise<any> => {
      const files = await pickFiles()
      if (files.length === 0) return { canceled: true }
      const localPaths: string[] = []
      for (const file of files) {
        const uploaded = await uploadToServer(file)
        localPaths.push(uploaded.path)
      }
      return invoke('sftp:upload', [sessionId, remotePath, localPaths])
    },
    download: async (sessionId: string, remotePath: string): Promise<any> => {
      const result = await invoke('sftp:download', [sessionId, remotePath])
      if (result?.downloadUrl) triggerDownload(result.downloadUrl)
      return result
    },
    readFile: (sessionId: string, remotePath: string): Promise<any> => invoke('sftp:readFile', [sessionId, remotePath]),
    deploy: (sessionId: string, localDir: string, remoteDir: string, filePaths?: string[], taskId?: string): Promise<any> =>
      invoke('sftp:deploy', [sessionId, localDir, remoteDir, filePaths, taskId]),
    downloadFiles: async (sessionId: string, remotePaths: string[], targetLocalDir?: string, taskId?: string): Promise<any> => {
      const result = await invoke('sftp:downloadFiles', [sessionId, remotePaths, targetLocalDir, taskId])
      if (result?.downloadUrl) triggerDownload(result.downloadUrl)
      return result
    },
    duplicate: (sessionId: string, remotePath: string): Promise<any> => invoke('sftp:duplicate', [sessionId, remotePath]),
    move: (sessionId: string, oldPath: string, newPath: string): Promise<any> => invoke('sftp:move', [sessionId, oldPath, newPath]),
    writeFile: (sessionId: string, remotePath: string, content: string): Promise<any> => invoke('sftp:writeFile', [sessionId, remotePath, content]),
    zip: (sessionId: string, targetPath: string, outputPath: string): Promise<any> => invoke('sftp:zip', [sessionId, targetPath, outputPath]),
    unzip: (sessionId: string, zipPath: string, targetDir: string): Promise<any> => invoke('sftp:unzip', [sessionId, zipPath, targetDir]),
    cancelTask: (taskId: string): Promise<any> => invoke('sftp:cancelTask', [taskId]),
    onProgress: (callback: (data: { taskId: string; progress: number; speed: string; detail: string }) => void) =>
      on('sftp:progress', callback),
    chmod: (sessionId: string, remotePath: string, mode: number): Promise<any> => invoke('sftp:chmod', [sessionId, remotePath, mode])
  },

  local: {
    listDir: (dirPath: string): Promise<LocalEntry[]> => invoke('local:listDir', [dirPath]),
    selectDir: async (): Promise<string | null> => {
      const { pickPath } = await import('./path-picker')
      return pickPath({ mode: 'dir', title: 'Chọn thư mục trên máy chủ' })
    },
    getDrives: (): Promise<{ name: string; path: string; isDirectory: boolean }[]> => invoke('local:getDrives'),
    mkdir: (dirPath: string): Promise<any> => invoke('local:mkdir', [dirPath]),
    rename: (oldPath: string, newPath: string): Promise<any> => invoke('local:rename', [oldPath, newPath]),
    delete: (targetPath: string): Promise<any> => invoke('local:delete', [targetPath]),
    writeFile: (filePath: string, content: string): Promise<any> => invoke('local:writeFile', [filePath, content]),
    zip: (targetPath: string, outputPath: string): Promise<any> => invoke('local:zip', [targetPath, outputPath]),
    unzip: (zipPath: string, targetDir: string): Promise<any> => invoke('local:unzip', [zipPath, targetDir]),
    watchDir: (dirPath: string, watchId: string): Promise<any> => invoke('local:watchDir', [dirPath, watchId]),
    unwatchDir: (watchId: string): Promise<any> => invoke('local:unwatchDir', [watchId]),
    onFileChanged: (callback: (data: { watchId: string; localPath: string; relativePath: string }) => void) =>
      on('local:file-changed', callback)
  },

  tunnel: {
    startLocal: (sessionId: string, name: string, localPort: number, remoteHost: string, remotePort: number): Promise<any> =>
      invoke('tunnel:startLocal', [sessionId, name, localPort, remoteHost, remotePort]),
    startRemote: (sessionId: string, name: string, remotePort: number, localHost: string, localPort: number): Promise<any> =>
      invoke('tunnel:startRemote', [sessionId, name, remotePort, localHost, localPort]),
    stop: (id: string): Promise<any> => invoke('tunnel:stop', [id]),
    list: (): Promise<any> => invoke('tunnel:list')
  },

  port: {
    scan: (sessionId: string): Promise<any> => invoke('port:scan', [sessionId])
  },

  history: {
    list: (): Promise<any[]> => invoke('history:list'),
    readLog: (sessionId: string): Promise<string> => invoke('history:readLog', [sessionId]),
    clear: (): Promise<any> => invoke('history:clear')
  },

  // A browser tab cannot be minimized/maximized/closed by the page.
  window: {
    minimize: async (): Promise<void> => {},
    maximize: async (): Promise<void> => {},
    close: async (): Promise<void> => {},
    isMaximized: async (): Promise<boolean> => false,
    onMaximizedChange: (_callback: (maximized: boolean) => void): (() => void) => () => {}
  }
}

export type WebApi = typeof api

export function installWebApi(): void {
  ;(window as any).api = api
  connectEvents()
}
