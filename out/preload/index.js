"use strict";
const electron = require("electron");
const api = {
  ssh: {
    connect: (config) => {
      return electron.ipcRenderer.invoke("ssh:connect", config);
    },
    shellInput: (sessionId, data) => {
      electron.ipcRenderer.send("ssh:shell-input", sessionId, data);
    },
    shellResize: (sessionId, cols, rows) => {
      electron.ipcRenderer.send("ssh:shell-resize", sessionId, cols, rows);
    },
    disconnect: (sessionId) => {
      return electron.ipcRenderer.invoke("ssh:disconnect", sessionId);
    },
    exec: (sessionId, cmd) => {
      return electron.ipcRenderer.invoke("ssh:exec", sessionId, cmd);
    },
    onOutput: (callback) => {
      const handler = (_, sessionId, data) => callback(sessionId, data);
      electron.ipcRenderer.on("shell:output", handler);
      return () => electron.ipcRenderer.removeListener("shell:output", handler);
    },
    onExit: (callback) => {
      const handler = (_, sessionId, code) => callback(sessionId, code);
      electron.ipcRenderer.on("shell:exit", handler);
      return () => electron.ipcRenderer.removeListener("shell:exit", handler);
    },
    onError: (callback) => {
      const handler = (_, sessionId, error) => callback(sessionId, error);
      electron.ipcRenderer.on("shell:error", handler);
      return () => electron.ipcRenderer.removeListener("shell:error", handler);
    }
  },
  db: {
    all: (sql, params) => {
      return electron.ipcRenderer.invoke("db:all", sql, params ?? []);
    },
    run: (sql, params) => {
      return electron.ipcRenderer.invoke("db:run", sql, params ?? []);
    },
    get: (sql, params) => {
      return electron.ipcRenderer.invoke("db:get", sql, params ?? []);
    }
  },
  app: {
    listThemes: () => {
      return electron.ipcRenderer.invoke("app:listThemes");
    },
    copyToClipboard: (text) => {
      return electron.ipcRenderer.invoke("app:copyToClipboard", text);
    },
    selectFile: (filters) => {
      return electron.ipcRenderer.invoke("app:selectFile", filters);
    },
    encryptPassword: (plaintext) => {
      return electron.ipcRenderer.invoke("app:encryptPassword", plaintext);
    },
    decryptPassword: (encrypted) => {
      return electron.ipcRenderer.invoke("app:decryptPassword", encrypted);
    }
  },
  sftp: {
    listDir: (sessionId, dirPath) => {
      return electron.ipcRenderer.invoke("sftp:listDir", sessionId, dirPath);
    },
    deleteFile: (sessionId, filePath) => {
      return electron.ipcRenderer.invoke("sftp:deleteFile", sessionId, filePath);
    },
    deleteDir: (sessionId, dirPath) => {
      return electron.ipcRenderer.invoke("sftp:deleteDir", sessionId, dirPath);
    },
    mkdir: (sessionId, dirPath) => {
      return electron.ipcRenderer.invoke("sftp:mkdir", sessionId, dirPath);
    },
    rename: (sessionId, oldPath, newPath) => {
      return electron.ipcRenderer.invoke("sftp:rename", sessionId, oldPath, newPath);
    },
    upload: (sessionId, remotePath) => {
      return electron.ipcRenderer.invoke("sftp:upload", sessionId, remotePath);
    },
    download: (sessionId, remotePath) => {
      return electron.ipcRenderer.invoke("sftp:download", sessionId, remotePath);
    },
    readFile: (sessionId, remotePath) => {
      return electron.ipcRenderer.invoke("sftp:readFile", sessionId, remotePath);
    },
    deploy: (sessionId, localDir, remoteDir, filePaths) => {
      return electron.ipcRenderer.invoke("sftp:deploy", sessionId, localDir, remoteDir, filePaths);
    },
    downloadFiles: (sessionId, remotePaths, targetLocalDir) => {
      return electron.ipcRenderer.invoke("sftp:downloadFiles", sessionId, remotePaths, targetLocalDir);
    },
    duplicate: (sessionId, remotePath) => {
      return electron.ipcRenderer.invoke("sftp:duplicate", sessionId, remotePath);
    },
    move: (sessionId, oldPath, newPath) => {
      return electron.ipcRenderer.invoke("sftp:move", sessionId, oldPath, newPath);
    },
    writeFile: (sessionId, remotePath, content) => {
      return electron.ipcRenderer.invoke("sftp:writeFile", sessionId, remotePath, content);
    }
  },
  local: {
    listDir: (dirPath) => {
      return electron.ipcRenderer.invoke("local:listDir", dirPath);
    },
    selectDir: () => {
      return electron.ipcRenderer.invoke("local:selectDir");
    },
    getDrives: () => {
      return electron.ipcRenderer.invoke("local:getDrives");
    },
    mkdir: (dirPath) => {
      return electron.ipcRenderer.invoke("local:mkdir", dirPath);
    },
    rename: (oldPath, newPath) => {
      return electron.ipcRenderer.invoke("local:rename", oldPath, newPath);
    },
    delete: (targetPath) => {
      return electron.ipcRenderer.invoke("local:delete", targetPath);
    },
    writeFile: (filePath, content) => {
      return electron.ipcRenderer.invoke("local:writeFile", filePath, content);
    }
  },
  tunnel: {
    startLocal: (sessionId, name, localPort, remoteHost, remotePort) => {
      return electron.ipcRenderer.invoke("tunnel:startLocal", sessionId, name, localPort, remoteHost, remotePort);
    },
    startRemote: (sessionId, name, remotePort, localHost, localPort) => {
      return electron.ipcRenderer.invoke("tunnel:startRemote", sessionId, name, remotePort, localHost, localPort);
    },
    stop: (id) => {
      return electron.ipcRenderer.invoke("tunnel:stop", id);
    },
    list: () => {
      return electron.ipcRenderer.invoke("tunnel:list");
    }
  },
  port: {
    scan: (sessionId) => {
      return electron.ipcRenderer.invoke("port:scan", sessionId);
    }
  },
  history: {
    list: () => {
      return electron.ipcRenderer.invoke("history:list");
    },
    readLog: (sessionId) => {
      return electron.ipcRenderer.invoke("history:readLog", sessionId);
    },
    clear: () => {
      return electron.ipcRenderer.invoke("history:clear");
    }
  },
  window: {
    minimize: () => electron.ipcRenderer.invoke("app:minimize"),
    maximize: () => electron.ipcRenderer.invoke("app:maximize"),
    close: () => electron.ipcRenderer.invoke("app:close"),
    isMaximized: () => electron.ipcRenderer.invoke("app:isMaximized"),
    onMaximizedChange: (callback) => {
      const handler = (_, maximized) => callback(maximized);
      electron.ipcRenderer.on("window:maximized-changed", handler);
      return () => electron.ipcRenderer.removeListener("window:maximized-changed", handler);
    }
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
