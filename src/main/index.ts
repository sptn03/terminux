import { app, BrowserWindow, shell } from 'electron'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import { initDatabase } from './db'
import { registerDbIpc } from './ipc/db.ipc'
import { registerSshIpc } from './ipc/ssh.ipc'
import { registerSftpIpc } from './ipc/sftp.ipc'
import { registerTunnelIpc } from './ipc/tunnel.ipc'
import { registerPortIpc } from './ipc/port.ipc'
import { registerLocalIpc } from './ipc/local.ipc'
import { registerAppIpc, setMainWindow } from './ipc/app.ipc'

function resolvePreloadPath(): string {
  const fromDirname = join(__dirname, '../preload/index.js')
  const fromAppPath = resolve(app.getAppPath(), 'out/preload/index.js')
  const fromCwd = resolve(process.cwd(), 'out/preload/index.js')
  // Log all candidates for debugging
  console.log('[terminux] __dirname:', __dirname)
  console.log('[terminux] app.getAppPath():', app.getAppPath())
  console.log('[terminux] fromDirname:', fromDirname, 'exists:', existsSync(fromDirname))
  console.log('[terminux] fromAppPath:', fromAppPath, 'exists:', existsSync(fromAppPath))
  console.log('[terminux] fromCwd:', fromCwd, 'exists:', existsSync(fromCwd))
  if (existsSync(fromDirname)) return fromDirname
  if (existsSync(fromAppPath)) return fromAppPath
  if (existsSync(fromCwd)) return fromCwd
  throw new Error(`Cannot find preload/index.js. Checked:\n  ${fromDirname}\n  ${fromAppPath}\n  ${fromCwd}`)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    roundedCorners: true,
    title: 'Terminux',
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  setMainWindow(mainWindow)

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-changed', false))

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()
  registerDbIpc()
  registerSshIpc()
  registerSftpIpc()
  registerTunnelIpc()
  registerPortIpc()
  registerLocalIpc()
  registerAppIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
