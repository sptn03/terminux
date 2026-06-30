import { Client } from 'ssh2'

export interface SSHConfig {
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key' | 'agent'
  password?: string
  privateKeyPath?: string
  passphrase?: string
  sessionId?: string
}

export interface ShellSession {
  sessionId: string
  config: SSHConfig
  client: Client
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
  onData: (callback: (data: string) => void) => void
  onExit: (callback: (code: number | null) => void) => void
  onError: (callback: (err: Error) => void) => void
}
