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

  // Keep track of active task cancellations
  const activeTasks = new Map<string, { canceled: boolean }>()

  ipcMain.handle('sftp:cancelTask', async (_event, taskId: string) => {
    const task = activeTasks.get(taskId)
    if (task) {
      task.canceled = true
      return { success: true }
    }
    return { error: 'Không tìm thấy tiến trình đang chạy' }
  })

  // Bulk upload — deploy local folder to remote
  ipcMain.handle('sftp:deploy', async (_event, sessionId: string, localDir: string, remoteDir: string, filePaths?: string[], taskId?: string) => {
    const fs = require('fs')
    const path = require('path')
    const { BrowserWindow } = require('electron')

    const taskObj = { canceled: false }
    if (taskId) {
      activeTasks.set(taskId, taskObj)
    }

    let files: Array<{ localPath: string; relativePath: string; size: number }> = []

    function scan(dir: string, prefix: string = '') {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true })
        for (const item of items) {
          const fullPath = path.join(dir, item.name)
          const rel = prefix ? prefix + '/' + item.name : item.name
          if (item.isDirectory()) {
            scan(fullPath, rel)
          } else if (item.isFile()) {
            const stat = fs.statSync(fullPath)
            files.push({ localPath: fullPath, relativePath: rel, size: stat.size })
          }
        }
      } catch {}
    }

    if (filePaths && filePaths.length > 0) {
      for (const fp of filePaths) {
        try {
          const stat = fs.statSync(fp)
          if (stat.isDirectory()) {
            const baseName = path.basename(fp)
            const scanSub = (dir: string, prefix: string) => {
              const items = fs.readdirSync(dir, { withFileTypes: true })
              for (const item of items) {
                const fullPath = path.join(dir, item.name)
                const rel = prefix ? prefix + '/' + item.name : item.name
                if (item.isDirectory()) {
                  scanSub(fullPath, rel)
                } else if (item.isFile()) {
                  const s = fs.statSync(fullPath)
                  files.push({ localPath: fullPath, relativePath: rel, size: s.size })
                }
              }
            }
            scanSub(fp, baseName)
          } else {
            files.push({
              localPath: fp,
              relativePath: path.basename(fp),
              size: stat.size
            })
          }
        } catch {}
      }
    } else {
      scan(localDir)
    }

    const total = files.length
    let uploaded = 0
    let totalBytesTransferred = 0
    const errors: string[] = []
    const startTime = Date.now()

    for (const file of files) {
      if (taskId && taskObj.canceled) {
        errors.push('Đã hủy bỏ bởi người dùng')
        break
      }
      try {
        const remoteFilePath = remoteDir.endsWith('/') ? remoteDir + file.relativePath : remoteDir + '/' + file.relativePath
        const remoteFileDir = path.dirname(remoteFilePath).replace(/\\/g, '/')

        // Ensure remote directory exists (mkdir -p style)
        try { await sftpManager.mkdirRecursive(sessionId, remoteFileDir) } catch {}

        const data = fs.readFileSync(file.localPath)
        await sftpManager.writeFile(sessionId, remoteFilePath.replace(/\\/g, '/'), data)
        
        uploaded++
        totalBytesTransferred += file.size

        if (taskId) {
          const elapsed = (Date.now() - startTime) / 1000 || 1
          const speedBytes = totalBytesTransferred / elapsed
          let speedStr = ''
          if (speedBytes > 1048576) {
            speedStr = `${(speedBytes / 1048576).toFixed(1)} MB/s`
          } else {
            speedStr = `${(speedBytes / 1024).toFixed(1)} KB/s`
          }

          const progressPercent = Math.round((uploaded / total) * 100)
          
          // Send progress to renderer
          const win = BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) {
            win.webContents.send('sftp:progress', {
              taskId,
              progress: progressPercent,
              speed: speedStr,
              detail: `${uploaded}/${total} tệp`
            })
          }
        }
      } catch (err: any) {
        errors.push(`${file.relativePath}: ${err.message}`)
      }
    }

    if (taskId) {
      activeTasks.delete(taskId)
    }

    return { uploaded, total, errors, canceled: taskObj.canceled }
  })

  // Bulk download — remote paths → local directory
  ipcMain.handle('sftp:downloadFiles', async (_event, sessionId: string, remotePaths: string[], targetLocalDir?: string, taskId?: string) => {
    const fs = require('fs')
    const path = require('path')
    const { BrowserWindow } = require('electron')

    const taskObj = { canceled: false }
    if (taskId) {
      activeTasks.set(taskId, taskObj)
    }
 
    let localDir = targetLocalDir
    if (!localDir) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || !result.filePaths[0]) {
        if (taskId) activeTasks.delete(taskId)
        return { canceled: true }
      }
      localDir = result.filePaths[0]
    }
 
    const files: Array<{ remotePath: string; relativePath: string; size: number }> = []
    for (const rp of remotePaths) {
      const remoteFiles = await sftpManager.listDirRecursive(sessionId, rp)
      const baseName = path.basename(rp)
      const stat = await sftpManager.stat(sessionId, rp)
      if (stat.isDirectory) {
        for (const f of remoteFiles) {
          const rel = f.path.startsWith(rp) ? f.path.slice(rp.length + 1) : path.basename(f.path)
          files.push({ remotePath: f.path, relativePath: path.join(baseName, rel), size: f.size })
        }
      } else {
        files.push({ remotePath: rp, relativePath: path.basename(rp), size: stat.size })
      }
    }

    const total = files.length
    let downloaded = 0
    let totalBytesTransferred = 0
    const errors: string[] = []
    const startTime = Date.now()

    for (const file of files) {
      if (taskId && taskObj.canceled) {
        errors.push('Đã hủy bỏ bởi người dùng')
        break
      }
      try {
        const destPath = path.join(localDir, file.relativePath)
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
        const data = await sftpManager.readFile(sessionId, file.remotePath)
        fs.writeFileSync(destPath, data)
        
        downloaded++
        totalBytesTransferred += file.size

        if (taskId) {
          const elapsed = (Date.now() - startTime) / 1000 || 1
          const speedBytes = totalBytesTransferred / elapsed
          let speedStr = ''
          if (speedBytes > 1048576) {
            speedStr = `${(speedBytes / 1048576).toFixed(1)} MB/s`
          } else {
            speedStr = `${(speedBytes / 1024).toFixed(1)} KB/s`
          }

          const progressPercent = Math.round((downloaded / total) * 100)

          const win = BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) {
            win.webContents.send('sftp:progress', {
              taskId,
              progress: progressPercent,
              speed: speedStr,
              detail: `${downloaded}/${total} tệp`
            })
          }
        }
      } catch (err: any) {
        errors.push(`${file.relativePath}: ${err.message}`)
      }
    }

    if (taskId) {
      activeTasks.delete(taskId)
    }

    return { downloaded, total, errors, canceled: taskObj.canceled }
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

  // Zip a file/folder on Remote Server using sshexec
  ipcMain.handle('sftp:zip', async (_event, sessionId: string, targetPath: string, outputPath: string) => {
    try {
      // Run tar or zip depending on zip extension. We can use standard 'tar -czf output.tar.gz -C parent dirname' or zip
      const isZip = outputPath.endsWith('.zip')
      const path = require('path')
      const parentDir = path.dirname(targetPath).replace(/\\/g, '/')
      const baseName = path.basename(targetPath)
      
      let cmd = ''
      if (isZip) {
        cmd = `cd "${parentDir}" && zip -r "${outputPath}" "${baseName}"`
      } else {
        cmd = `cd "${parentDir}" && tar -czf "${outputPath}" "${baseName}"`
      }
      
      const { stdout, stderr, code } = await sshManager.exec(sessionId, cmd)
      if (code !== 0) {
        throw new Error(stderr || stdout || `Command exited with code ${code}`)
      }
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Unzip a file on Remote Server
  ipcMain.handle('sftp:unzip', async (_event, sessionId: string, zipPath: string, targetDir: string) => {
    try {
      const isZip = zipPath.endsWith('.zip')
      let cmd = ''
      if (isZip) {
        cmd = `unzip -o "${zipPath}" -d "${targetDir}"`
      } else {
        cmd = `tar -xzf "${zipPath}" -C "${targetDir}"`
      }
      const { stdout, stderr, code } = await sshManager.exec(sessionId, cmd)
      if (code !== 0) {
        throw new Error(stderr || stdout || `Command exited with code ${code}`)
      }
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Set file permissions (chmod) on Remote Server
  ipcMain.handle('sftp:chmod', async (_event, sessionId: string, remotePath: string, mode: number) => {
    try {
      await sftpManager.chmod(sessionId, remotePath, mode)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}
