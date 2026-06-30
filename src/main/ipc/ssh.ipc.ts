import { ipcMain } from 'electron'
import { sshManager } from '../ssh/ssh-manager'
import { SSHConfig } from '../ssh/types'

export function registerSshIpc(): void {
  ipcMain.handle('ssh:connect', async (_event, config: SSHConfig) => {
    const result = await sshManager.connect(config)
    return result
  })

  ipcMain.on('ssh:shell-input', (_event, sessionId: string, data: string) => {
    sshManager.write(sessionId, data)
  })

  ipcMain.on('ssh:shell-resize', (_event, sessionId: string, cols: number, rows: number) => {
    sshManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle('ssh:disconnect', async (_event, sessionId: string) => {
    sshManager.disconnect(sessionId)
  })

  ipcMain.handle('ssh:exec', async (_event, sessionId: string, cmd: string) => {
    return sshManager.exec(sessionId, cmd)
  })
}
