import { Client, ClientChannel } from 'ssh2'
import { SSHConfig, ShellSession } from './types'

export function createShellSession(config: SSHConfig, sessionId?: string, client?: Client): Promise<ShellSession> {
  return new Promise((resolve, reject) => {
    const id = sessionId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const conn = client || new Client()
    let channel: ClientChannel | null = null
    let dataCallback: ((data: string) => void) | null = null
    const buffer: string[] = []
    let exitCallback: ((code: number | null) => void) | null = null
    let errorCallback: ((err: Error) => void) | null = null
    let closed = false

    const cleanup = () => {
      closed = true
      channel?.close()
      conn.end()
      channel = null
    }

    conn.on('ready', () => {
      conn.shell(
        { term: 'xterm-256color', cols: 120, rows: 32 },
        (err, stream) => {
          if (err) {
            cleanup()
            reject(err)
            return
          }

          channel = stream

          const userDataPath = require('electron').app.getPath('userData')
          const logsDir = require('path').join(userDataPath, 'session_logs')
          if (!require('fs').existsSync(logsDir)) {
            require('fs').mkdirSync(logsDir, { recursive: true })
          }
          const logFilePath = require('path').join(logsDir, `${id}.log`)

          stream.on('data', (data: Buffer) => {
            const str = data.toString('utf-8')
            if (dataCallback) dataCallback(str)
            else buffer.push(str)
            try {
              require('fs').appendFileSync(logFilePath, data)
            } catch {}
          })

          stream.stderr.on('data', (data: Buffer) => {
            const str = data.toString('utf-8')
            if (dataCallback) dataCallback(str)
            else buffer.push(str)
            try {
              require('fs').appendFileSync(logFilePath, data)
            } catch {}
          })

          stream.on('close', (code: number | null) => {
            if (exitCallback) exitCallback(code)
            cleanup()
          })

          stream.on('error', (err: Error) => {
            if (errorCallback) errorCallback(err)
          })

          const session: ShellSession = {
            sessionId: id,
            config,
            client: conn,
            write: (data: string) => {
              if (!closed && channel && channel.writable) {
                channel.write(data)
              }
            },
            resize: (cols: number, rows: number) => {
              if (!closed && channel) {
                channel.setWindow(rows, cols, 0, 0)
              }
            },
            close: () => {
              cleanup()
            },
            onData: (callback: (data: string) => void) => {
              dataCallback = callback
              while (buffer.length > 0) {
                callback(buffer.shift()!)
              }
            },
            onExit: (callback: (code: number | null) => void) => {
              exitCallback = callback
            },
            onError: (callback: (err: Error) => void) => {
              errorCallback = callback
            }
          }

          resolve(session)
        }
      )
    })

    conn.on('error', (err: Error) => {
      reject(err)
    })

    conn.on('close', () => {
      if (!closed) {
        closed = true
        if (exitCallback) exitCallback(null)
      }
    })

    // Connect based on auth method
    const connectConfig: any = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 10000
    }

    if (config.authMethod === 'password') {
      connectConfig.password = config.password
    } else if (config.authMethod === 'key' && config.privateKeyPath) {
      connectConfig.privateKeyPath = config.privateKeyPath
      if (config.passphrase) {
        connectConfig.passphrase = config.passphrase
      }
    } else if (config.authMethod === 'agent') {
      connectConfig.agent = process.env.SSH_AUTH_SOCK
    }

    conn.connect(connectConfig)
  })
}
