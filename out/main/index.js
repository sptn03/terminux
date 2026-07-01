"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const ssh2 = require("ssh2");
const net = require("net");
const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  username TEXT NOT NULL DEFAULT 'root',
  auth_method TEXT DEFAULT 'password',
  password TEXT,
  private_key_path TEXT,
  passphrase TEXT,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  color TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS terminal_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_builtin INTEGER DEFAULT 0,
  config TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_history (
  id TEXT PRIMARY KEY,
  host_name TEXT NOT NULL,
  host_address TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);
`;
const DEFAULT_SETTINGS = {
  theme: "one-dark",
  font_family: "JetBrains Mono, Menlo, monospace",
  font_size: "14",
  cursor_style: "block",
  cursor_blink: "true",
  opacity: "1.0",
  background_image: "",
  background_blur: "0"
};
const BUILTIN_THEMES = [
  {
    id: "one-dark",
    name: "One Dark",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#282c34",
      foreground: "#abb2bf",
      cursor: "#528bff",
      selectionBackground: "#3e4451",
      black: "#282c34",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#abb2bf",
      brightBlack: "#5c6370",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff"
    })
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#002b36",
      foreground: "#839496",
      cursor: "#93a1a1",
      selectionBackground: "#073642",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3"
    })
  },
  {
    id: "dracula",
    name: "Dracula",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      selectionBackground: "#44475a",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff"
    })
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      selectionBackground: "#45475a",
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#f5c2e7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#585b70",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#f5c2e7",
      brightCyan: "#94e2d5",
      brightWhite: "#a6adc8"
    })
  },
  {
    id: "terminux-seamless",
    name: "Terminux Seamless",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#11111b",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      selectionBackground: "#313244",
      black: "#313244",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#f5c2e7",
      cyan: "#94e2d5",
      white: "#cdd6f4",
      brightBlack: "#45475a",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#f5c2e7",
      brightCyan: "#94e2d5",
      brightWhite: "#ffffff"
    })
  },
  {
    id: "nord",
    name: "Nord",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#2e3440",
      foreground: "#d8dee9",
      cursor: "#88c0d0",
      selectionBackground: "#434c5e",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4"
    })
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#282828",
      foreground: "#ebdbb2",
      cursor: "#fe8019",
      selectionBackground: "#504945",
      black: "#282828",
      red: "#cc241d",
      green: "#98971a",
      yellow: "#d79921",
      blue: "#458588",
      magenta: "#b16286",
      cyan: "#689d6a",
      white: "#a89984",
      brightBlack: "#928374",
      brightRed: "#fb4934",
      brightGreen: "#b8bb26",
      brightYellow: "#fabd2f",
      brightBlue: "#83a598",
      brightMagenta: "#d3869b",
      brightCyan: "#8ec07c",
      brightWhite: "#ebdbb2"
    })
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#1a1b26",
      foreground: "#a9b1d6",
      cursor: "#c0caf5",
      selectionBackground: "#343b58",
      black: "#1a1b26",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5"
    })
  },
  {
    id: "aura-dark",
    name: "Aura Dark",
    is_builtin: 1,
    config: JSON.stringify({
      background: "#15141b",
      foreground: "#edecee",
      cursor: "#a277ff",
      selectionBackground: "#322d43",
      black: "#110f18",
      red: "#ff6767",
      green: "#61ffca",
      yellow: "#ffca85",
      blue: "#a277ff",
      magenta: "#a277ff",
      cyan: "#61ffca",
      white: "#edecee",
      brightBlack: "#4d4d4d",
      brightRed: "#ff6767",
      brightGreen: "#61ffca",
      brightYellow: "#ffca85",
      brightBlue: "#a277ff",
      brightMagenta: "#a277ff",
      brightCyan: "#61ffca",
      brightWhite: "#ffffff"
    })
  }
];
let db = null;
function getDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}
function initDatabase() {
  const userDataPath = electron.app.getPath("userData");
  const dbDir = path.join(userDataPath, "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, "terminux.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(CREATE_TABLES);
  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)"
  );
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value);
  }
  const insertTheme = db.prepare(
    "INSERT OR REPLACE INTO terminal_themes (id, name, is_builtin, config) VALUES (?, ?, ?, ?)"
  );
  for (const theme of BUILTIN_THEMES) {
    insertTheme.run(theme.id, theme.name, theme.is_builtin, theme.config);
  }
  console.log(`Database initialized at ${dbPath}`);
}
function registerDbIpc() {
  electron.ipcMain.handle("db:all", (_event, sql, params) => {
    try {
      const db2 = getDb();
      const stmt = db2.prepare(sql);
      return stmt.all(...params);
    } catch (err) {
      console.error("db:all error:", err.message);
      throw err;
    }
  });
  electron.ipcMain.handle("db:run", (_event, sql, params) => {
    try {
      const db2 = getDb();
      const stmt = db2.prepare(sql);
      const result = stmt.run(...params);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (err) {
      console.error("db:run error:", err.message);
      throw err;
    }
  });
  electron.ipcMain.handle("db:get", (_event, sql, params) => {
    try {
      const db2 = getDb();
      const stmt = db2.prepare(sql);
      return stmt.get(...params) ?? null;
    } catch (err) {
      console.error("db:get error:", err.message);
      throw err;
    }
  });
}
function createShellSession(config, sessionId, client) {
  return new Promise((resolve, reject) => {
    const id = sessionId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const conn = client || new ssh2.Client();
    let channel = null;
    let dataCallback = null;
    const buffer = [];
    let exitCallback = null;
    let errorCallback = null;
    let closed = false;
    const cleanup = () => {
      closed = true;
      channel?.close();
      conn.end();
      channel = null;
    };
    conn.on("ready", () => {
      conn.shell(
        { term: "xterm-256color", cols: 120, rows: 32 },
        (err, stream) => {
          if (err) {
            cleanup();
            reject(err);
            return;
          }
          channel = stream;
          const userDataPath = require("electron").app.getPath("userData");
          const logsDir = require("path").join(userDataPath, "session_logs");
          if (!require("fs").existsSync(logsDir)) {
            require("fs").mkdirSync(logsDir, { recursive: true });
          }
          const logFilePath = require("path").join(logsDir, `${id}.log`);
          stream.on("data", (data) => {
            const str = data.toString("utf-8");
            if (dataCallback) dataCallback(str);
            else buffer.push(str);
            try {
              require("fs").appendFileSync(logFilePath, data);
            } catch {
            }
          });
          stream.stderr.on("data", (data) => {
            const str = data.toString("utf-8");
            if (dataCallback) dataCallback(str);
            else buffer.push(str);
            try {
              require("fs").appendFileSync(logFilePath, data);
            } catch {
            }
          });
          stream.on("close", (code) => {
            if (exitCallback) exitCallback(code);
            cleanup();
          });
          stream.on("error", (err2) => {
            if (errorCallback) errorCallback(err2);
          });
          const session = {
            sessionId: id,
            config,
            client: conn,
            write: (data) => {
              if (!closed && channel && channel.writable) {
                channel.write(data);
              }
            },
            resize: (cols, rows) => {
              if (!closed && channel) {
                channel.setWindow(rows, cols, 0, 0);
              }
            },
            close: () => {
              cleanup();
            },
            onData: (callback) => {
              dataCallback = callback;
              while (buffer.length > 0) {
                callback(buffer.shift());
              }
            },
            onExit: (callback) => {
              exitCallback = callback;
            },
            onError: (callback) => {
              errorCallback = callback;
            }
          };
          resolve(session);
        }
      );
    });
    conn.on("error", (err) => {
      reject(err);
    });
    conn.on("close", () => {
      if (!closed) {
        closed = true;
        if (exitCallback) exitCallback(null);
      }
    });
    const connectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 1e4
    };
    if (config.authMethod === "password") {
      connectConfig.password = config.password;
    } else if (config.authMethod === "key" && config.privateKeyPath) {
      connectConfig.privateKeyPath = config.privateKeyPath;
      if (config.passphrase) {
        connectConfig.passphrase = config.passphrase;
      }
    } else if (config.authMethod === "agent") {
      connectConfig.agent = process.env.SSH_AUTH_SOCK;
    }
    conn.connect(connectConfig);
  });
}
class SftpManager {
  sessions = /* @__PURE__ */ new Map();
  async attach(sessionId, client) {
    return new Promise((resolve, reject) => {
      if (this.sessions.has(sessionId)) {
        resolve();
        return;
      }
      client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        this.sessions.set(sessionId, { client, sftp });
        resolve();
      });
    });
  }
  detach(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.sftp.end();
      this.sessions.delete(sessionId);
    }
  }
  async listDir(sessionId, dirPath) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("SFTP session not found");
    return new Promise((resolve, reject) => {
      session.sftp.readdir(dirPath, (err, list) => {
        if (err) {
          reject(err);
          return;
        }
        const files = list.filter((f) => f.filename !== "." && f.filename !== "..").map((f) => ({
          name: f.filename,
          path: path.join(dirPath, f.filename).replace(/\\/g, "/"),
          size: f.attrs.size,
          mode: f.attrs.mode,
          isDirectory: f.attrs.isDirectory(),
          isFile: f.attrs.isFile(),
          modifiedAt: null
        }));
        resolve(files);
      });
    });
  }
  async stat(sessionId, filePath) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("SFTP session not found");
    return new Promise((resolve, reject) => {
      session.sftp.stat(filePath, (err, attrs) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          name: path.basename(filePath),
          path: filePath,
          size: attrs.size,
          mode: attrs.mode,
          isDirectory: attrs.isDirectory(),
          isFile: attrs.isFile(),
          modifiedAt: attrs.mtime ? new Date(attrs.mtime * 1e3) : null
        });
      });
    });
  }
  async readFile(sessionId, filePath) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("SFTP session not found");
    return new Promise((resolve, reject) => {
      session.sftp.readFile(filePath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }
  async writeFile(sessionId, filePath, data) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("SFTP session not found");
    return new Promise((resolve, reject) => {
      session.sftp.writeFile(filePath, data, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  async deleteFile(sessionId, filePath) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("SFTP session not found");
    return new Promise((resolve, reject) => {
      session.sftp.unlink(filePath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  async deleteDir(sessionId, dirPath) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("SFTP session not found");
    return new Promise((resolve, reject) => {
      session.sftp.rmdir(dirPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  async mkdir(sessionId, dirPath) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("SFTP session not found");
    return new Promise((resolve, reject) => {
      session.sftp.mkdir(dirPath, (err) => {
        if (err && err.message !== "Failure") {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  async mkdirRecursive(sessionId, dirPath) {
    const parts = dirPath.replace(/\\/g, "/").split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current += "/" + part;
      try {
        await this.mkdir(sessionId, current);
      } catch {
      }
    }
  }
  async rename(sessionId, oldPath, newPath) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("SFTP session not found");
    return new Promise((resolve, reject) => {
      session.sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  async listDirRecursive(sessionId, dirPath) {
    const result = [];
    const self = this;
    async function walk(path2) {
      const entries = await self.listDir(sessionId, path2);
      for (const entry of entries) {
        if (entry.isDirectory) {
          await walk(entry.path);
        } else {
          result.push(entry);
        }
      }
    }
    const stat = await this.stat(sessionId, dirPath);
    if (!stat.isDirectory) {
      result.push(stat);
      return result;
    }
    await walk(dirPath);
    return result;
  }
}
const sftpManager = new SftpManager();
class TunnelManager {
  tunnels = /* @__PURE__ */ new Map();
  servers = /* @__PURE__ */ new Map();
  clients = /* @__PURE__ */ new Map();
  registerClient(sessionId, client) {
    this.clients.set(sessionId, client);
  }
  unregisterClient(sessionId) {
    for (const [id, t] of this.tunnels) {
      if (t.sessionId === sessionId) this.stopTunnel(id);
    }
    this.clients.delete(sessionId);
  }
  async startLocalForward(sessionId, name, localPort, remoteHost, remotePort) {
    const client = this.clients.get(sessionId);
    if (!client) throw new Error("SSH connection not found");
    const id = `tunnel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        client.forwardOut("127.0.0.1", localPort, remoteHost, remotePort, (err, stream) => {
          if (err) {
            console.error("[tunnel] forwardOut error:", err.message);
            socket.destroy();
            return;
          }
          socket.pipe(stream).pipe(socket);
        });
      });
      server.listen(localPort, "127.0.0.1", () => {
        const addr = server.address();
        const tunnel = {
          id,
          sessionId,
          type: "local",
          name,
          listenHost: "127.0.0.1",
          listenPort: addr.port,
          targetHost: remoteHost,
          targetPort: remotePort,
          active: true
        };
        this.tunnels.set(id, tunnel);
        this.servers.set(id, server);
        resolve(tunnel);
      });
      server.on("error", (err) => {
        reject(err);
      });
    });
  }
  async startRemoteForward(sessionId, name, remotePort, localHost, localPort) {
    const client = this.clients.get(sessionId);
    if (!client) throw new Error("SSH connection not found");
    const id = `tunnel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
      client.forwardIn("0.0.0.0", remotePort, (err) => {
        if (err) {
          reject(err);
          return;
        }
        client.on("tcp connection", (info, accept, rejectConn) => {
          if (info.destIP !== "0.0.0.0" && info.destIP !== "127.0.0.1") {
            rejectConn?.();
            return;
          }
          if (info.destPort !== remotePort) {
            rejectConn?.();
            return;
          }
          const stream = accept();
          if (!stream) return;
          const sock = require("net").connect(localPort, localHost, () => {
            stream.pipe(sock).pipe(stream);
          });
          sock.on("error", () => stream.end());
        });
        const tunnel = {
          id,
          sessionId,
          type: "remote",
          name,
          listenHost: "0.0.0.0",
          listenPort: remotePort,
          targetHost: localHost,
          targetPort: localPort,
          active: true
        };
        this.tunnels.set(id, tunnel);
        resolve(tunnel);
      });
    });
  }
  stopTunnel(id) {
    const tunnel = this.tunnels.get(id);
    if (!tunnel) return;
    tunnel.active = false;
    tunnel.error = "stopped";
    if (tunnel.type === "local") {
      const server = this.servers.get(id);
      if (server) {
        try {
          server.close();
        } catch {
        }
      }
    } else if (tunnel.type === "remote") {
      const client = this.clients.get(tunnel.sessionId);
      if (client) {
        try {
          client.unforwardIn("0.0.0.0", tunnel.listenPort);
        } catch {
        }
      }
    }
    this.tunnels.delete(id);
    this.servers.delete(id);
  }
  listTunnels() {
    return Array.from(this.tunnels.values());
  }
  stopAllForSession(sessionId) {
    for (const [id, t] of this.tunnels) {
      if (t.sessionId === sessionId) this.stopTunnel(id);
    }
  }
}
const tunnelManager = new TunnelManager();
class SSHManager {
  sessions = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  async connect(config) {
    const sessionId = config.sessionId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const client = new ssh2.Client();
    this.pending.set(sessionId, { client, sessionId });
    try {
      const session = await createShellSession(config, sessionId, client);
      this.pending.delete(sessionId);
      this.sessions.set(session.sessionId, session);
      try {
        const db2 = getDb();
        const savedHost = db2.prepare("SELECT name FROM hosts WHERE host = ?").get(config.host);
        const hostName = savedHost ? savedHost.name : config.host;
        db2.prepare("INSERT INTO session_history (id, host_name, host_address) VALUES (?, ?, ?)").run(session.sessionId, hostName, config.host);
      } catch (dbErr) {
        console.error("[terminux] Session history logging failed:", dbErr.message);
      }
      tunnelManager.registerClient(session.sessionId, session.client);
      try {
        await sftpManager.attach(session.sessionId, session.client);
      } catch (err) {
        console.error("[terminux] SFTP attach failed:", err.message);
      }
      session.onData((data) => {
        const win = electron.BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send("shell:output", session.sessionId, data);
        }
      });
      session.onExit((code) => {
        const win = electron.BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send("shell:exit", session.sessionId, code);
        }
        try {
          const db2 = getDb();
          db2.prepare("UPDATE session_history SET ended_at = datetime('now') WHERE id = ?").run(session.sessionId);
        } catch (dbErr) {
          console.error("[terminux] Session history update failed:", dbErr.message);
        }
        this.sessions.delete(session.sessionId);
      });
      session.onError((err) => {
        const win = electron.BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send("shell:error", session.sessionId, err.message);
        }
      });
      return { sessionId: session.sessionId };
    } catch (err) {
      this.pending.delete(sessionId);
      const win = electron.BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("shell:error", sessionId, err.message || "Connection failed");
      }
      return { sessionId: "", error: err.message || "Connection failed" };
    }
  }
  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.write(data);
    }
  }
  getClient(sessionId) {
    const session = this.sessions.get(sessionId);
    return session?.client ?? null;
  }
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.resize(cols, rows);
    }
  }
  disconnect(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      tunnelManager.stopAllForSession(sessionId);
      sftpManager.detach(sessionId);
      session.close();
      this.sessions.delete(sessionId);
      return;
    }
    const pending = this.pending.get(sessionId);
    if (pending) {
      pending.client.end();
      this.pending.delete(sessionId);
    }
  }
  exec(sessionId, cmd) {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return reject(new Error("Session not found"));
      }
      session.client.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("close", (code) => {
          resolve({ stdout, stderr, code });
        }).on("data", (data) => {
          stdout += data.toString("utf8");
        }).stderr.on("data", (data) => {
          stderr += data.toString("utf8");
        });
      });
    });
  }
  disconnectAll() {
    for (const [id, session] of this.sessions) {
      session.close();
    }
    this.sessions.clear();
    for (const [id, pending] of this.pending) {
      pending.client.end();
    }
    this.pending.clear();
  }
}
const sshManager = new SSHManager();
function registerSshIpc() {
  electron.ipcMain.handle("ssh:connect", async (_event, config) => {
    const result = await sshManager.connect(config);
    return result;
  });
  electron.ipcMain.on("ssh:shell-input", (_event, sessionId, data) => {
    sshManager.write(sessionId, data);
  });
  electron.ipcMain.on("ssh:shell-resize", (_event, sessionId, cols, rows) => {
    sshManager.resize(sessionId, cols, rows);
  });
  electron.ipcMain.handle("ssh:disconnect", async (_event, sessionId) => {
    sshManager.disconnect(sessionId);
  });
  electron.ipcMain.handle("ssh:exec", async (_event, sessionId, cmd) => {
    return sshManager.exec(sessionId, cmd);
  });
}
function registerSftpIpc() {
  electron.ipcMain.handle("sftp:listDir", async (_event, sessionId, dirPath) => {
    try {
      return await sftpManager.listDir(sessionId, dirPath);
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:deleteFile", async (_event, sessionId, filePath) => {
    try {
      await sftpManager.deleteFile(sessionId, filePath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:deleteDir", async (_event, sessionId, dirPath) => {
    try {
      await sftpManager.deleteDir(sessionId, dirPath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:mkdir", async (_event, sessionId, dirPath) => {
    try {
      await sftpManager.mkdir(sessionId, dirPath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:rename", async (_event, sessionId, oldPath, newPath) => {
    try {
      await sftpManager.rename(sessionId, oldPath, newPath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:upload", async (_event, sessionId, remotePath) => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const results = [];
    for (const localPath of result.filePaths) {
      const fs2 = require("fs");
      try {
        const data = fs2.readFileSync(localPath);
        const filename = require("path").basename(localPath);
        const remoteFile = remotePath.endsWith("/") ? remotePath + filename : remotePath + "/" + filename;
        await sftpManager.writeFile(sessionId, remoteFile, data);
        results.push({ filename, success: true });
      } catch (err) {
        results.push({ filename: require("path").basename(localPath), error: err.message });
      }
    }
    return { results };
  });
  electron.ipcMain.handle("sftp:download", async (_event, sessionId, remotePath) => {
    const result = await electron.dialog.showSaveDialog({
      defaultPath: require("path").basename(remotePath)
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      const data = await sftpManager.readFile(sessionId, remotePath);
      require("fs").writeFileSync(result.filePath, data);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:readFile", async (_event, sessionId, remotePath) => {
    try {
      const data = await sftpManager.readFile(sessionId, remotePath);
      const text = data.toString("utf-8");
      if (text.indexOf("\0") >= 0) {
        return { error: "Binary file", isText: false, size: data.length };
      }
      return { content: text, isText: true, size: data.length };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:deploy", async (_event, sessionId, localDir, remoteDir, filePaths) => {
    const fs2 = require("fs");
    const path2 = require("path");
    let files;
    if (filePaths && filePaths.length > 0) {
      files = filePaths.map((fp) => ({
        localPath: fp,
        relativePath: path2.basename(fp)
      }));
    } else {
      let scan = function(dir, prefix = "") {
        try {
          const items = fs2.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            const fullPath = path2.join(dir, item.name);
            const rel = prefix ? prefix + "/" + item.name : item.name;
            if (item.isDirectory()) scan(fullPath, rel);
            else if (item.isFile()) files.push({ localPath: fullPath, relativePath: rel });
          }
        } catch {
        }
      };
      files = [];
      scan(localDir);
    }
    const total = files.length;
    let uploaded = 0;
    const errors = [];
    for (const file of files) {
      try {
        const remoteFilePath = remoteDir.endsWith("/") ? remoteDir + file.relativePath : remoteDir + "/" + file.relativePath;
        const remoteFileDir = path2.dirname(remoteFilePath).replace(/\\/g, "/");
        try {
          await sftpManager.mkdirRecursive(sessionId, remoteFileDir);
        } catch {
        }
        const data = fs2.readFileSync(file.localPath);
        await sftpManager.writeFile(sessionId, remoteFilePath.replace(/\\/g, "/"), data);
        uploaded++;
      } catch (err) {
        errors.push(`${file.relativePath}: ${err.message}`);
      }
    }
    return { uploaded, total, errors };
  });
  electron.ipcMain.handle("sftp:downloadFiles", async (_event, sessionId, remotePaths, targetLocalDir) => {
    const fs2 = require("fs");
    const path2 = require("path");
    let localDir = targetLocalDir;
    if (!localDir) {
      const result = await electron.dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"]
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      localDir = result.filePaths[0];
    }
    const files = [];
    for (const rp of remotePaths) {
      const remoteFiles = await sftpManager.listDirRecursive(sessionId, rp);
      const baseName = path2.basename(rp);
      const stat = await sftpManager.stat(sessionId, rp);
      if (stat.isDirectory) {
        for (const f of remoteFiles) {
          const rel = f.path.startsWith(rp) ? f.path.slice(rp.length + 1) : path2.basename(f.path);
          files.push({ remotePath: f.path, relativePath: path2.join(baseName, rel) });
        }
      } else {
        files.push({ remotePath: rp, relativePath: path2.basename(rp) });
      }
    }
    const total = files.length;
    let downloaded = 0;
    const errors = [];
    for (const file of files) {
      try {
        const destPath = path2.join(localDir, file.relativePath);
        const destDir = path2.dirname(destPath);
        if (!fs2.existsSync(destDir)) fs2.mkdirSync(destDir, { recursive: true });
        const data = await sftpManager.readFile(sessionId, file.remotePath);
        fs2.writeFileSync(destPath, data);
        downloaded++;
      } catch (err) {
        errors.push(`${file.relativePath}: ${err.message}`);
      }
    }
    return { downloaded, total, errors };
  });
  electron.ipcMain.handle("sftp:duplicate", async (_event, sessionId, remotePath) => {
    try {
      const path2 = require("path");
      const dir = path2.dirname(remotePath);
      const ext = path2.extname(remotePath);
      const base = path2.basename(remotePath, ext);
      const newPath = dir + "/" + base + " (copy)" + ext;
      const data = await sftpManager.readFile(sessionId, remotePath);
      await sftpManager.writeFile(sessionId, newPath, data);
      return { success: true, path: newPath };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:move", async (_event, sessionId, oldPath, newPath) => {
    try {
      await sftpManager.rename(sessionId, oldPath, newPath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("sftp:writeFile", async (_event, sessionId, remotePath, content) => {
    try {
      const data = Buffer.from(content, "utf-8");
      await sftpManager.writeFile(sessionId, remotePath, data);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
}
function registerTunnelIpc() {
  electron.ipcMain.handle("tunnel:startLocal", async (_event, sessionId, name, localPort, remoteHost, remotePort) => {
    try {
      const tunnel = await tunnelManager.startLocalForward(sessionId, name, localPort, remoteHost, remotePort);
      return tunnel;
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("tunnel:startRemote", async (_event, sessionId, name, remotePort, localHost, localPort) => {
    try {
      const tunnel = await tunnelManager.startRemoteForward(sessionId, name, remotePort, localHost, localPort);
      return tunnel;
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("tunnel:stop", async (_event, id) => {
    tunnelManager.stopTunnel(id);
    return { success: true };
  });
  electron.ipcMain.handle("tunnel:list", async () => {
    return tunnelManager.listTunnels();
  });
}
function registerPortIpc() {
  electron.ipcMain.handle("port:scan", async (_event, sessionId) => {
    const client = sshManager.getClient(sessionId);
    if (!client) return { error: "No SSH connection" };
    return new Promise((resolve) => {
      const cmd = `ss -tlnp 2>/dev/null | tail -n +2 | awk '{print $4}' | rev | cut -d: -f1 | rev | sort -n | uniq || netstat -tlnp 2>/dev/null | awk '{print $4}' | rev | cut -d: -f1 | rev | grep -E '^[0-9]' | sort -n | uniq`;
      client.exec(cmd, (err, stream) => {
        if (err) {
          resolve({ error: err.message });
          return;
        }
        let data = "";
        stream.on("data", (chunk) => {
          data += chunk.toString();
        });
        stream.on("close", () => {
          const ports = data.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && /^\d+$/.test(l)).map((l) => parseInt(l, 10)).filter((p) => p > 0 && p < 65536);
          const unique = [...new Set(ports)].sort((a, b) => a - b);
          resolve(unique);
        });
        stream.stderr.on("data", () => {
        });
      });
    });
  });
}
function listLocalDir(dirPath) {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const entries = [];
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      try {
        const fullPath = path.join(dirPath, item.name);
        const stat = fs.statSync(fullPath);
        entries.push({
          name: item.name,
          path: fullPath,
          size: stat.size,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          modifiedAt: stat.mtime.toISOString()
        });
      } catch {
      }
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  } catch {
    return [];
  }
}
function registerLocalIpc() {
  electron.ipcMain.handle("local:listDir", async (_event, dirPath) => {
    return listLocalDir(dirPath);
  });
  electron.ipcMain.handle("local:selectDir", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle("local:getDrives", async () => {
    if (process.platform === "win32") {
      const { execSync } = require("child_process");
      try {
        let drives = [];
        try {
          const output = execSync("fsutil fsinfo drives", { encoding: "utf8", timeout: 2e3, stdio: "pipe" });
          drives = output.replace(/^Drives:\s*/i, "").split(/\s+/).map((d) => d.trim()).filter(Boolean);
        } catch {
          const output = execSync('powershell -Command "[System.IO.DriveInfo]::GetDrives().Name"', { encoding: "utf8", timeout: 2e3, stdio: "pipe" });
          drives = output.split("\n").map((d) => d.trim()).filter(Boolean);
        }
        if (drives.length > 0) {
          return drives.map((d) => {
            const formatted = d.endsWith("\\") ? d : d + "\\";
            return {
              name: d.endsWith("\\") ? d.slice(0, -1) : d,
              path: formatted,
              isDirectory: true
            };
          });
        }
      } catch {
      }
      return ["C:\\", "D:\\"].filter((d) => {
        try {
          fs.readdirSync(d);
          return true;
        } catch {
          return false;
        }
      }).map((d) => ({ name: d.endsWith("\\") ? d.slice(0, -1) : d, path: d, isDirectory: true }));
    }
    return [{ name: "/", path: "/", isDirectory: true }];
  });
  electron.ipcMain.handle("local:mkdir", async (_event, dirPath) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("local:rename", async (_event, oldPath, newPath) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("local:delete", async (_event, targetPath) => {
    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  electron.ipcMain.handle("local:writeFile", async (_event, filePath, content) => {
    try {
      require("fs").writeFileSync(filePath, content, "utf-8");
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
}
let mainWindow$1 = null;
function setMainWindow(w) {
  mainWindow$1 = w;
}
function registerAppIpc() {
  electron.ipcMain.handle("app:listThemes", () => {
    const db2 = getDb();
    return db2.prepare("SELECT * FROM terminal_themes ORDER BY is_builtin DESC, name ASC").all();
  });
  electron.ipcMain.handle("app:copyToClipboard", (_event, text) => {
    electron.clipboard.writeText(text);
  });
  electron.ipcMain.handle("app:selectFile", async (_event, filters) => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: filters ?? [{ name: "All Files", extensions: ["*"] }]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  electron.ipcMain.handle("app:encryptPassword", (_event, plaintext) => {
    if (!electron.safeStorage.isEncryptionAvailable()) return plaintext;
    const encrypted = electron.safeStorage.encryptString(plaintext);
    return encrypted.toString("base64");
  });
  electron.ipcMain.handle("app:decryptPassword", (_event, encrypted) => {
    if (!electron.safeStorage.isEncryptionAvailable()) return encrypted;
    try {
      return electron.safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return encrypted;
    }
  });
  electron.ipcMain.handle("app:minimize", () => {
    mainWindow$1?.minimize();
  });
  electron.ipcMain.handle("app:maximize", () => {
    if (mainWindow$1?.isMaximized()) {
      mainWindow$1.unmaximize();
    } else {
      mainWindow$1?.maximize();
    }
  });
  electron.ipcMain.handle("app:close", () => {
    mainWindow$1?.close();
  });
  electron.ipcMain.handle("app:isMaximized", () => {
    return mainWindow$1?.isMaximized() ?? false;
  });
  electron.ipcMain.handle("history:list", () => {
    try {
      const db2 = getDb();
      return db2.prepare("SELECT * FROM session_history ORDER BY started_at DESC").all();
    } catch (err) {
      console.error(err);
      return [];
    }
  });
  electron.ipcMain.handle("history:readLog", (_event, sessionId) => {
    const fs2 = require("fs");
    const path2 = require("path");
    const userDataPath = electron.app.getPath("userData");
    const logFilePath = path2.join(userDataPath, "session_logs", `${sessionId}.log`);
    if (fs2.existsSync(logFilePath)) {
      try {
        return fs2.readFileSync(logFilePath, "utf-8");
      } catch (err) {
        return `Lỗi đọc nhật ký: ${err.message}`;
      }
    }
    return "Không tìm thấy dữ liệu nhật ký cho phiên này.";
  });
  electron.ipcMain.handle("history:clear", () => {
    try {
      const db2 = getDb();
      db2.prepare("DELETE FROM session_history").run();
      const fs2 = require("fs");
      const path2 = require("path");
      const userDataPath = electron.app.getPath("userData");
      const logsDir = path2.join(userDataPath, "session_logs");
      if (fs2.existsSync(logsDir)) {
        const files = fs2.readdirSync(logsDir);
        for (const file of files) {
          try {
            fs2.unlinkSync(path2.join(logsDir, file));
          } catch {
          }
        }
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
}
function resolvePreloadPath() {
  const fromDirname = path.join(__dirname, "../preload/index.js");
  const fromAppPath = path.resolve(electron.app.getAppPath(), "out/preload/index.js");
  const fromCwd = path.resolve(process.cwd(), "out/preload/index.js");
  console.log("[terminux] __dirname:", __dirname);
  console.log("[terminux] app.getAppPath():", electron.app.getAppPath());
  console.log("[terminux] fromDirname:", fromDirname, "exists:", fs.existsSync(fromDirname));
  console.log("[terminux] fromAppPath:", fromAppPath, "exists:", fs.existsSync(fromAppPath));
  console.log("[terminux] fromCwd:", fromCwd, "exists:", fs.existsSync(fromCwd));
  if (fs.existsSync(fromDirname)) return fromDirname;
  if (fs.existsSync(fromAppPath)) return fromAppPath;
  if (fs.existsSync(fromCwd)) return fromCwd;
  throw new Error(`Cannot find preload/index.js. Checked:
  ${fromDirname}
  ${fromAppPath}
  ${fromCwd}`);
}
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    roundedCorners: true,
    title: "Terminux",
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });
  setMainWindow(mainWindow);
  mainWindow.on("maximize", () => mainWindow?.webContents.send("window:maximized-changed", true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("window:maximized-changed", false));
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  initDatabase();
  registerDbIpc();
  registerSshIpc();
  registerSftpIpc();
  registerTunnelIpc();
  registerPortIpc();
  registerLocalIpc();
  registerAppIpc();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
