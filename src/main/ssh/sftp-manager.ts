import { Client, SFTPWrapper } from 'ssh2'
import { join, basename, dirname } from 'path'

interface SftpEntry {
  filename: string
  longname: string
  attrs: {
    size: number
    mode: number
    isDirectory: () => boolean
    isFile: () => boolean
  }
}

export interface SftpFile {
  name: string
  path: string
  size: number
  mode: number
  isDirectory: boolean
  isFile: boolean
  modifiedAt: Date | null
}

class SftpManager {
  private sessions: Map<string, { client: Client; sftp: SFTPWrapper }> = new Map()

  async attach(sessionId: string, client: Client): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already attached
      if (this.sessions.has(sessionId)) {
        resolve()
        return
      }
      client.sftp((err, sftp) => {
        if (err) { reject(err); return }
        this.sessions.set(sessionId, { client, sftp })
        resolve()
      })
    })
  }

  detach(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.sftp.end()
      this.sessions.delete(sessionId)
    }
  }

  async listDir(sessionId: string, dirPath: string): Promise<SftpFile[]> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP session not found')

    return new Promise((resolve, reject) => {
      session.sftp.readdir(dirPath, (err, list: SftpEntry[]) => {
        if (err) { reject(err); return }
        const files: SftpFile[] = list
          .filter((f) => f.filename !== '.' && f.filename !== '..')
          .map((f) => ({
            name: f.filename,
            path: join(dirPath, f.filename).replace(/\\/g, '/'),
            size: f.attrs.size,
            mode: f.attrs.mode,
            isDirectory: f.attrs.isDirectory(),
            isFile: f.attrs.isFile(),
            modifiedAt: null
          }))
        resolve(files)
      })
    })
  }

  async stat(sessionId: string, filePath: string): Promise<SftpFile> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP session not found')

    return new Promise((resolve, reject) => {
      session.sftp.stat(filePath, (err, attrs) => {
        if (err) { reject(err); return }
        resolve({
          name: basename(filePath),
          path: filePath,
          size: attrs.size,
          mode: attrs.mode,
          isDirectory: attrs.isDirectory(),
          isFile: attrs.isFile(),
          modifiedAt: attrs.mtime ? new Date(attrs.mtime * 1000) : null
        })
      })
    })
  }

  async readFile(sessionId: string, filePath: string): Promise<Buffer> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP session not found')

    return new Promise((resolve, reject) => {
      session.sftp.readFile(filePath, (err, data) => {
        if (err) { reject(err); return }
        resolve(data)
      })
    })
  }

  async writeFile(sessionId: string, filePath: string, data: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP session not found')

    return new Promise((resolve, reject) => {
      session.sftp.writeFile(filePath, data, (err) => {
        if (err) { reject(err); return }
        resolve()
      })
    })
  }

  async deleteFile(sessionId: string, filePath: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP session not found')

    return new Promise((resolve, reject) => {
      session.sftp.unlink(filePath, (err) => {
        if (err) { reject(err); return }
        resolve()
      })
    })
  }

  async deleteDir(sessionId: string, dirPath: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP session not found')

    return new Promise((resolve, reject) => {
      session.sftp.rmdir(dirPath, (err) => {
        if (err) { reject(err); return }
        resolve()
      })
    })
  }

  async mkdir(sessionId: string, dirPath: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP session not found')

    return new Promise((resolve, reject) => {
      session.sftp.mkdir(dirPath, (err) => {
        if (err && err.message !== 'Failure') { reject(err); return }
        resolve()
      })
    })
  }

  async mkdirRecursive(sessionId: string, dirPath: string): Promise<void> {
    const parts = dirPath.replace(/\\/g, '/').split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      try { await this.mkdir(sessionId, current) } catch { /* exists */ }
    }
  }

  async rename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP session not found')

    return new Promise((resolve, reject) => {
      session.sftp.rename(oldPath, newPath, (err) => {
        if (err) { reject(err); return }
        resolve()
      })
    })
  }

  async listDirRecursive(sessionId: string, dirPath: string): Promise<SftpFile[]> {
    const result: SftpFile[] = []
    const self = this

    async function walk(path: string): Promise<void> {
      const entries = await self.listDir(sessionId, path)
      for (const entry of entries) {
        if (entry.isDirectory) {
          await walk(entry.path)
        } else {
          result.push(entry)
        }
      }
    }

    const stat = await this.stat(sessionId, dirPath)
    if (!stat.isDirectory) {
      result.push(stat)
      return result
    }

    await walk(dirPath)
    return result
  }
}

export const sftpManager = new SftpManager()
