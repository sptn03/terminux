import { Client } from 'ssh2'
import { createServer, AddressInfo } from 'net'

interface Tunnel {
  id: string
  sessionId: string
  type: 'local' | 'remote'
  name: string
  listenHost: string
  listenPort: number
  targetHost: string
  targetPort: number
  active: boolean
  error?: string
}

class TunnelManager {
  private tunnels: Map<string, Tunnel> = new Map()
  private servers: Map<string, any> = new Map()
  private clients: Map<string, Client> = new Map()

  registerClient(sessionId: string, client: Client): void {
    this.clients.set(sessionId, client)
  }

  unregisterClient(sessionId: string): void {
    // Stop all tunnels for this session
    for (const [id, t] of this.tunnels) {
      if (t.sessionId === sessionId) this.stopTunnel(id)
    }
    this.clients.delete(sessionId)
  }

  async startLocalForward(sessionId: string, name: string, localPort: number, remoteHost: string, remotePort: number): Promise<Tunnel> {
    const client = this.clients.get(sessionId)
    if (!client) throw new Error('SSH connection not found')

    const id = `tunnel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        client!.forwardOut('127.0.0.1', localPort, remoteHost, remotePort, (err, stream) => {
          if (err) {
            console.error('[tunnel] forwardOut error:', err.message)
            socket.destroy()
            return
          }
          socket.pipe(stream).pipe(socket)
        })
      })

      server.listen(localPort, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo
        const tunnel: Tunnel = {
          id, sessionId, type: 'local', name, listenHost: '127.0.0.1',
          listenPort: addr.port, targetHost: remoteHost, targetPort: remotePort, active: true
        }
        this.tunnels.set(id, tunnel)
        this.servers.set(id, server)
        resolve(tunnel)
      })

      server.on('error', (err) => {
        reject(err)
      })
    })
  }

  async startRemoteForward(sessionId: string, name: string, remotePort: number, localHost: string, localPort: number): Promise<Tunnel> {
    const client = this.clients.get(sessionId)
    if (!client) throw new Error('SSH connection not found')

    const id = `tunnel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    return new Promise((resolve, reject) => {
      client.forwardIn('0.0.0.0', remotePort, (err) => {
        if (err) { reject(err); return }

        client.on('tcp connection', (info, accept, rejectConn) => {
          if (info.destIP !== '0.0.0.0' && info.destIP !== '127.0.0.1') {
            rejectConn?.()
            return
          }
          if (info.destPort !== remotePort) {
            rejectConn?.()
            return
          }
          const stream = accept()
          if (!stream) return

          const sock = require('net').connect(localPort, localHost, () => {
            stream.pipe(sock).pipe(stream)
          })
          sock.on('error', () => stream.end())
        })

        const tunnel: Tunnel = {
          id, sessionId, type: 'remote', name,
          listenHost: '0.0.0.0', listenPort: remotePort,
          targetHost: localHost, targetPort: localPort, active: true
        }
        this.tunnels.set(id, tunnel)
        resolve(tunnel)
      })
    })
  }

  stopTunnel(id: string): void {
    const tunnel = this.tunnels.get(id)
    if (!tunnel) return

    tunnel.active = false
    tunnel.error = 'stopped'

    if (tunnel.type === 'local') {
      const server = this.servers.get(id)
      if (server) {
        try { server.close() } catch {}
      }
    } else if (tunnel.type === 'remote') {
      const client = this.clients.get(tunnel.sessionId)
      if (client) {
        try { client.unforwardIn('0.0.0.0', tunnel.listenPort) } catch {}
      }
    }

    this.tunnels.delete(id)
    this.servers.delete(id)
  }

  listTunnels(): Tunnel[] {
    return Array.from(this.tunnels.values())
  }

  stopAllForSession(sessionId: string): void {
    for (const [id, t] of this.tunnels) {
      if (t.sessionId === sessionId) this.stopTunnel(id)
    }
  }
}

export const tunnelManager = new TunnelManager()
