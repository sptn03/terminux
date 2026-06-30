import { Client } from 'ssh2'
import { SSHConfig, ShellSession } from './types'
import { createShellSession } from './shell-session'
import { sftpManager } from './sftp-manager'
import { tunnelManager } from './tunnel-manager'
import { BrowserWindow } from 'electron'

class SSHManager {
  private sessions: Map<string, ShellSession> = new Map()
  private pending: Map<string, { client: Client; sessionId: string }> = new Map()

  async connect(config: SSHConfig): Promise<{ sessionId: string; error?: string }> {
    const sessionId = config.sessionId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const client = new Client()

    // Store in pending immediately so it can be cancelled mid-handshake
    this.pending.set(sessionId, { client, sessionId })

    try {
      const session = await createShellSession(config, sessionId, client)
      // Move from pending to active
      this.pending.delete(sessionId)
      this.sessions.set(session.sessionId, session)

      // Log session start to history database
      try {
        const db = require('../db').getDb()
        const savedHost = db.prepare('SELECT name FROM hosts WHERE host = ?').get(config.host)
        const hostName = savedHost ? savedHost.name : config.host
        db.prepare('INSERT INTO session_history (id, host_name, host_address) VALUES (?, ?, ?)').run(session.sessionId, hostName, config.host)
      } catch (dbErr: any) {
        console.error('[terminux] Session history logging failed:', dbErr.message)
      }

      // Register client for tunnel support
      tunnelManager.registerClient(session.sessionId, session.client)

      // Attach SFTP
      try {
        await sftpManager.attach(session.sessionId, session.client)
      } catch (err: any) {
        console.error('[terminux] SFTP attach failed:', err.message)
      }

      session.onData((data: string) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          win.webContents.send('shell:output', session.sessionId, data)
        }
      })

      session.onExit((code: number | null) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          win.webContents.send('shell:exit', session.sessionId, code)
        }
        // Update ended_at in history
        try {
          const db = require('../db').getDb()
          db.prepare("UPDATE session_history SET ended_at = datetime('now') WHERE id = ?").run(session.sessionId)
        } catch (dbErr: any) {
          console.error('[terminux] Session history update failed:', dbErr.message)
        }
        this.sessions.delete(session.sessionId)
      })

      session.onError((err: Error) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          win.webContents.send('shell:error', session.sessionId, err.message)
        }
      })

      return { sessionId: session.sessionId }
    } catch (err: any) {
      this.pending.delete(sessionId)
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('shell:error', sessionId, err.message || 'Connection failed')
      }
      return { sessionId: '', error: err.message || 'Connection failed' }
    }
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.write(data)
    }
  }

  getClient(sessionId: string): any | null {
    const session = this.sessions.get(sessionId)
    return session?.client ?? null
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.resize(cols, rows)
    }
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      tunnelManager.stopAllForSession(sessionId)
      sftpManager.detach(sessionId)
      session.close()
      this.sessions.delete(sessionId)
      return
    }

    // Check pending connections (still handshaking)
    const pending = this.pending.get(sessionId)
    if (pending) {
      pending.client.end()
      this.pending.delete(sessionId)
    }
  }

  exec(sessionId: string, cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(sessionId)
      if (!session) {
        return reject(new Error('Session not found'))
      }
      session.client.exec(cmd, (err, stream) => {
        if (err) return reject(err)
        let stdout = ''
        let stderr = ''
        stream.on('close', (code: number) => {
          resolve({ stdout, stderr, code })
        }).on('data', (data: Buffer) => {
          stdout += data.toString('utf8')
        }).stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf8')
        })
      })
    })
  }

  disconnectAll(): void {
    for (const [id, session] of this.sessions) {
      session.close()
    }
    this.sessions.clear()
    for (const [id, pending] of this.pending) {
      pending.client.end()
    }
    this.pending.clear()
  }
}

export const sshManager = new SSHManager()
