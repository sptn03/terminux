# Project Memory

AI readable project brain.

Goal:

Allow AI agents to understand this project quickly
without scanning the entire repository.


==================================================

# Overview

Project: Terminux

Purpose: Local SSH client desktop app — connect, manage hosts, terminal, snippets, themes. Personal use, no backend.

Stack: Electron 33 + React 18 + Tailwind CSS 3 + xterm.js 5 + ssh2 + better-sqlite3 + Zustand + Vite 5

Runtime: Node.js (Electron)

Deploy: None (local desktop app, built via electron-vite)


==================================================

# Architecture

Entry point: src/main/index.ts (Electron main process)

Main flow:

Renderer (React)  ←IPC→  Main Process (Node.js)
                                ├── SSH engine (ssh2)
                                └── SQLite (better-sqlite3)

- Renderer never touches Node.js directly. All communication via contextBridge.
- SSH sessions managed by SSHManager class, one ShellSession per tab.
- Database runs in main process, exposed via IPC handlers.
- State managed by Zustand stores in renderer.

Architecture decisions: DECISIONS.md


==================================================

# Important Files

| File | Purpose |
|---|---|
| src/main/index.ts | Electron app entry, window creation, IPC registration |
| src/main/ipc/ssh.ipc.ts | IPC handlers: connect, shell-input/resize, disconnect |
| src/main/ipc/db.ipc.ts | IPC handlers: db:all, db:run, db:get |
| src/main/ipc/app.ipc.ts | IPC handlers: themes, clipboard, file dialog |
| src/main/ssh/shell-session.ts | SSH connection → shell channel handler |
| src/main/ssh/ssh-manager.ts | Manages multiple concurrent SSH sessions |
| src/main/db/index.ts | SQLite init + migrations |
| src/main/db/schema.ts | CREATE TABLE + built-in themes |
| src/preload/index.ts | contextBridge API (typed) |
| src/renderer/App.tsx | Root React component |
| src/renderer/hooks/use-terminal.ts | xterm.js ↔ SSH IPC bridge |
| src/renderer/stores/*.ts | Zustand stores (host, snippet, settings, terminal) |


==================================================

# Folder Rules

Folder: src/main/

Purpose: Electron main process — SSH engine, database, IPC handlers

Do not modify: none


Folder: src/renderer/

Purpose: React UI — components, stores, hooks

Do not modify: none


Folder: src/preload/

Purpose: contextBridge — safe IPC bridge between main and renderer

Do not modify: Exposed API types must match renderer usage


==================================================

# Commands

Install: npm install

Run dev: npm run dev

Build: npm run build

Preview: npm run preview

Postinstall: electron-rebuild -f -w better-sqlite3,ssh2 (runs automatically)


==================================================

# Dependencies

Package: ssh2 — SSH protocol library (shell, sftp, tunnel)
Package: better-sqlite3 — Local database
Package: xterm.js — Web-based terminal emulator
Package: @xterm/addon-fit — Auto-resize xterm to container
Package: zustand — State management
Package: lucide-react — Icons
Package: nanoid — ID generation
Package: electron-vite — Build tooling
Package: electron-rebuild — Rebuild native modules for Electron


==================================================

# Code Patterns

Preferred patterns:
- All IPC via contextBridge only (no nodeIntegration)
- SSH sessions identified by sessionId (nanoid)
- Database queries via prepared statements in IPC handlers
- Zustand stores for all state (no prop drilling)
- Catppuccin Mocha dark theme (bg: #1e1e2e, fg: #cdd6f4)

Forbidden patterns:
- nodeIntegration in renderer
- Raw ipcRenderer exposed to renderer
- Direct fs/child_process access from renderer


==================================================

# Security Notes

Important:
- Passwords are encrypted using Electron `safeStorage` (base64 encoded ciphertext) when stored in SQLite.
- Private key paths stored, not key contents.
- SSH agent forwarded via SSH_AUTH_SOCK.
- SSH timeout 10s via readyTimeout config.


==================================================

# Performance Notes

Known bottlenecks:
- xterm.js writing large output can lag on slow connections — consider pausing output when tab not visible
- SQLite WAL mode enabled for concurrent reads


==================================================

# Known Issues

Issue: None currently reported.


==================================================

# AI Notes

Future AI agents should know:
- This is greenfield project, no legacy code.
- Catppuccin Mocha theme colors: bg #1e1e2e, surface #181825, surface1 #313244, overlay0 #6c7086, subtext0 #a6adc8, text #cdd6f4.
- Built-in themes: One Dark, Solarized Dark, Dracula, Catppuccin Mocha.
- Schema uses TEXT for all datetimes (SQLite has no native datetime type).
- Auth methods: password, key, agent.
- Tabs remember their full connection configuration in `TerminalTab.config` for Reconnect operations.
- Reconnection is supported via a Reconnect Overlay when a session disconnects, or via right-click context menu.
- If a connection fails to establish, the main process triggers a `shell:error` event before returning so that the error displays inside the terminal.
- Prompting for passwords dynamically when `authMethod === 'password'` and `password` is empty is supported.
