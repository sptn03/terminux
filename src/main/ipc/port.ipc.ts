import { ipcMain } from './ipc-bus'
import { sshManager } from '../ssh/ssh-manager'

export function registerPortIpc(): void {
  ipcMain.handle('port:scan', async (_event, sessionId: string) => {
    const client = sshManager.getClient(sessionId)
    if (!client) return { error: 'No SSH connection' }

    // Use `ss` or `netstat` to list listening ports
    // Prefer ss (faster), fallback netstat
    return new Promise((resolve) => {
      const cmd = `ss -tlnp 2>/dev/null | tail -n +2 | awk '{print $4}' | rev | cut -d: -f1 | rev | sort -n | uniq || netstat -tlnp 2>/dev/null | awk '{print $4}' | rev | cut -d: -f1 | rev | grep -E '^[0-9]' | sort -n | uniq`
      client.exec(cmd, (err: any, stream: any) => {
        if (err) { resolve({ error: err.message }); return }
        let data = ''
        stream.on('data', (chunk: Buffer) => { data += chunk.toString() })
        stream.on('close', () => {
          const ports = data.split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 0 && /^\d+$/.test(l))
            .map((l: string) => parseInt(l, 10))
            .filter((p: number) => p > 0 && p < 65536)
          // Deduplicate and sort
          const unique = [...new Set(ports)].sort((a, b) => a - b)
          resolve(unique)
        })
        stream.stderr.on('data', () => {})
      })
    })
  })
}
