import { ipcMain, dialog } from 'electron'
import { sftpManager } from '../ssh/sftp-manager'
import { sshManager } from '../ssh/ssh-manager'

export function registerSftpIpc(): void {
  ipcMain.handle('sftp:listDir', async (_event, sessionId: string, dirPath: string) => {
    try {
      return await sftpManager.listDir(sessionId, dirPath)
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('sftp:deleteFile', async (_event, sessionId: string, filePath: string) => {
    try {
      await sftpManager.deleteFile(sessionId, filePath)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('sftp:deleteDir', async (_event, sessionId: string, dirPath: string) => {
    try {
      await sftpManager.deleteDir(sessionId, dirPath)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('sftp:mkdir', async (_event, sessionId: string, dirPath: string) => {
    try {
      await sftpManager.mkdir(sessionId, dirPath)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('sftp:rename', async (_event, sessionId: string, oldPath: string, newPath: string) => {
    try {
      await sftpManager.rename(sessionId, oldPath, newPath)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('sftp:upload', async (_event, sessionId: string, remotePath: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    const results = []
    for (const localPath of result.filePaths) {
      const fs = require('fs')
      try {
        const data = fs.readFileSync(localPath)
        const filename = require('path').basename(localPath)
        const remoteFile = remotePath.endsWith('/') ? remotePath + filename : remotePath + '/' + filename
        await sftpManager.writeFile(sessionId, remoteFile, data)
        results.push({ filename, success: true })
      } catch (err: any) {
        results.push({ filename: require('path').basename(localPath), error: err.message })
      }
    }
    return { results }
  })

  ipcMain.handle('sftp:download', async (_event, sessionId: string, remotePath: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: require('path').basename(remotePath)
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const data = await sftpManager.readFile(sessionId, remotePath)
      require('fs').writeFileSync(result.filePath, data)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('sftp:readFile', async (_event, sessionId: string, remotePath: string) => {
    try {
      const data = await sftpManager.readFile(sessionId, remotePath)
      const text = data.toString('utf-8')
      if (text.indexOf('\x00') >= 0) {
        return { error: 'Binary file', isText: false, size: data.length }
      }
      return { content: text, isText: true, size: data.length }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Bulk upload — deploy local folder to remote
  ipcMain.handle('sftp:deploy', async (_event, sessionId: string, localDir: string, remoteDir: string, filePaths?: string[]) => {
    const fs = require('fs')
    const path = require('path')

    // If filePaths given, use them; otherwise scan whole dir
    let files: Array<{ localPath: string; relativePath: string }>

    if (filePaths && filePaths.length > 0) {
      files = filePaths.map((fp) => ({
        localPath: fp,
        relativePath: path.basename(fp)
      }))
    } else {
      files = []
      function scan(dir: string, prefix: string = '') {
        try {
          const items = fs.readdirSync(dir, { withFileTypes: true })
          for (const item of items) {
            const fullPath = path.join(dir, item.name)
            const rel = prefix ? prefix + '/' + item.name : item.name
            if (item.isDirectory()) scan(fullPath, rel)
            else if (item.isFile()) files.push({ localPath: fullPath, relativePath: rel })
          }
        } catch {}
      }
      scan(localDir)
    }
    const total = files.length
    let uploaded = 0
    const errors: string[] = []

    for (const file of files) {
      try {
        const remoteFilePath = remoteDir.endsWith('/') ? remoteDir + file.relativePath : remoteDir + '/' + file.relativePath
        const remoteFileDir = path.dirname(remoteFilePath).replace(/\\/g, '/')

        // Ensure remote directory exists (mkdir -p style)
        try { await sftpManager.mkdirRecursive(sessionId, remoteFileDir) } catch {}

        const data = fs.readFileSync(file.localPath)
        await sftpManager.writeFile(sessionId, remoteFilePath.replace(/\\/g, '/'), data)
        uploaded++
      } catch (err: any) {
        errors.push(`${file.relativePath}: ${err.message}`)
      }
    }

    return { uploaded, total, errors }
  })

  // Bulk download — remote paths → local directory
  ipcMain.handle('sftp:downloadFiles', async (_event, sessionId: string, remotePaths: string[], targetLocalDir?: string) => {
    const fs = require('fs')
    const path = require('path')
 
    let localDir = targetLocalDir
    if (!localDir) {
      // Open folder picker for destination
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || !result.filePaths[0]) return { canceled: true }
      localDir = result.filePaths[0]
    }
 
    // Collect all files to download (recurse into directories)
    const files: Array<{ remotePath: string; relativePath: string }> = []
    for (const rp of remotePaths) {
      const remoteFiles = await sftpManager.listDirRecursive(sessionId, rp)
      // Determine the base name to preserve relative structure
      const baseName = path.basename(rp)
      const stat = await sftpManager.stat(sessionId, rp)
      if (stat.isDirectory) {
        for (const f of remoteFiles) {
          const rel = f.path.startsWith(rp) ? f.path.slice(rp.length + 1) : path.basename(f.path)
          files.push({ remotePath: f.path, relativePath: path.join(baseName, rel) })
        }
      } else {
        files.push({ remotePath: rp, relativePath: path.basename(rp) })
      }
    }

    const total = files.length
    let downloaded = 0
    const errors: string[] = []

    for (const file of files) {
      try {
        const destPath = path.join(localDir, file.relativePath)
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
        const data = await sftpManager.readFile(sessionId, file.remotePath)
        fs.writeFileSync(destPath, data)
        downloaded++
      } catch (err: any) {
        errors.push(`${file.relativePath}: ${err.message}`)
      }
    }

    return { downloaded, total, errors }
  })

  // Duplicate file — copy to same dir with a suffix
  ipcMain.handle('sftp:duplicate', async (_event, sessionId: string, remotePath: string) => {
    try {
      const path = require('path')
      const dir = path.dirname(remotePath)
      const ext = path.extname(remotePath)
      const base = path.basename(remotePath, ext)
      const newPath = dir + '/' + base + ' (copy)' + ext
      const data = await sftpManager.readFile(sessionId, remotePath)
      await sftpManager.writeFile(sessionId, newPath, data)
      return { success: true, path: newPath }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Move/rename file — rename already handles this via full path
  ipcMain.handle('sftp:move', async (_event, sessionId: string, oldPath: string, newPath: string) => {
    try {
      await sftpManager.rename(sessionId, oldPath, newPath)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Write file content directly
  ipcMain.handle('sftp:writeFile', async (_event, sessionId: string, remotePath: string, content: string) => {
    try {
      const data = Buffer.from(content, 'utf-8')
      await sftpManager.writeFile(sessionId, remotePath, data)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}
