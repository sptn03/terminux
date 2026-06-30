import { ipcMain } from 'electron'
import { tunnelManager } from '../ssh/tunnel-manager'

export function registerTunnelIpc(): void {
  ipcMain.handle('tunnel:startLocal', async (_event, sessionId: string, name: string, localPort: number, remoteHost: string, remotePort: number) => {
    try {
      const tunnel = await tunnelManager.startLocalForward(sessionId, name, localPort, remoteHost, remotePort)
      return tunnel
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('tunnel:startRemote', async (_event, sessionId: string, name: string, remotePort: number, localHost: string, localPort: number) => {
    try {
      const tunnel = await tunnelManager.startRemoteForward(sessionId, name, remotePort, localHost, localPort)
      return tunnel
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('tunnel:stop', async (_event, id: string) => {
    tunnelManager.stopTunnel(id)
    return { success: true }
  })

  ipcMain.handle('tunnel:list', async () => {
    return tunnelManager.listTunnels()
  })
}
