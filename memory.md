# Project Memory

AI readable project brain.

Goal:

Allow AI agents to understand this project quickly
without scanning the entire repository.


==================================================

# Overview

Project: Terminux

Purpose: Web SSH client — connect, manage hosts, terminal, snippets, DevOps panels. Served by a Node.js server, opened in a browser.

Stack: Node.js 22 + React 18 + Tailwind CSS 3 + xterm.js 5 + ssh2 + better-sqlite3 + Zustand + Vite 5 (SPA) + esbuild (server) + ws (WebSocket)

Runtime: Node.js server (no Electron)

Deploy: `npm run build` then `npm start` (server serves dist/web + API). No desktop installer.


==================================================

# Architecture

Entry point: src/main/index.ts (Node HTTP + WebSocket server)

Main flow:

Browser (React SPA + xterm.js)
   ├── POST /api/invoke  {channel,args} → JSON   (request/response, thay ipcRenderer.invoke)
   ├── POST /api/send    {channel,args}          (fire-and-forget, dự phòng khi WS chưa mở)
   ├── WS   /api/events  ← shell:output / shell:exit / shell:error / sftp:progress / local:file-changed
   ├── POST /api/upload  ?name=<file>            (browser → thư mục tạm trên server)
   └── GET  /api/file, /api/download             (server → browser)
                                    │
                    Node server (src/main, ssh2 + better-sqlite3)
                                ├── SSH engine (ssh2)
                                └── SQLite (better-sqlite3)

- Renderer never touches Node.js directly. All communication via `window.api`, implemented in
  `src/renderer/lib/web-api.ts` (thay cho preload/contextBridge).
- `src/main/ipc/ipc-bus.ts` giả lập `ipcMain.handle`/`ipcMain.on` của Electron và cung cấp
  `invoke()` / `send()` / `broadcast()`. Nhờ đó các file `src/main/ipc/*.ipc.ts` giữ nguyên logic.
- SSH sessions managed by SSHManager class, one ShellSession per tab.
- Database runs in the server process, exposed via the `db:*` channels.
- State managed by Zustand stores in renderer.

Architecture decisions: DECISIONS.md (mục 2026-10-23: Electron → Web)


==================================================

# Important Files

| File | Purpose |
|---|---|
| src/main/index.ts | Node server: HTTP API, WebSocket events, Basic auth, static SPA, upload/download |
| src/main/ipc/ipc-bus.ts | Electron `ipcMain` shim + `broadcast()` push tới browser |
| src/main/paths.ts | Data dir (`./data` hoặc TERMINUX_DATA_DIR), logs, temp, filesystem jail |
| src/main/crypto.ts | AES-256-GCM mã hoá mật khẩu (thay `safeStorage`) |
| src/main/downloads.ts | Thư mục staging cho download + URL `/api/download` |
| src/main/ipc/ssh.ipc.ts | Handlers: connect, shell-input/resize, disconnect, exec |
| src/main/ipc/db.ipc.ts | Handlers: db:all, db:run, db:get |
| src/main/ipc/app.ipc.ts | Handlers: themes, clipboard, encrypt/decrypt, window (no-op), history |
| src/main/ssh/shell-session.ts | SSH connection → shell channel handler |
| src/main/ssh/ssh-manager.ts | Manages multiple concurrent SSH sessions |
| src/main/db/index.ts | SQLite init + migrations |
| src/main/db/schema.ts | CREATE TABLE + built-in themes |
| src/renderer/lib/web-api.ts | Browser implementation của `window.api` (HTTP + WebSocket) |
| src/renderer/lib/path-picker.ts | Modal chọn file/thư mục trên máy chủ (thay dialog của Electron) |
| src/renderer/App.tsx | Root React component |
| src/renderer/hooks/use-terminal.ts | xterm.js ↔ shell channels bridge |
| src/renderer/stores/*.ts | Zustand stores (host, snippet, settings, terminal) |
| src/renderer/components/devops/DevOpsDashboard.tsx | DevOps dashboard container and sub-tab navigator |
| src/renderer/components/devops/*Panel.tsx | DevOps sub-panel components (Overview, PM2, Docker, etc.) |
| src/renderer/components/devops/FtpPanel.tsx | Quản lý tài khoản FTP (vsftpd/pure-ftpd/proftpd): cài đặt, tạo/xoá/khoá user, chroot, passive ports, cấu hình |
| src/renderer/components/devops/FirewallPanel.tsx | Tường lửa đa engine: UFW, firewalld, nftables, iptables + fail2ban (jail, ban/unban IP) |
| src/renderer/components/devops/DatabasePanel.tsx | Instance DB, quản lý DB, user DB (MySQL/PostgreSQL), query, Redis explorer, backup/restore, cài engine |
| src/renderer/components/devops/UserManagementPanel.tsx | Quản lý user hệ thống + sudo + authorized_keys |
| src/renderer/components/devops/MultiExecPanel.tsx | Chạy một lệnh trên nhiều máy chủ (cluster) song song |
| src/renderer/components/devops/RemotePathPicker.tsx | Component duyệt tệp/thư mục trên server dùng chung cho các panel mới |
| vite.config.ts | Build SPA vào dist/web + proxy dev sang server :3000 |
| scripts/build-server.mjs | esbuild bundle server → dist/server/index.js |
| scripts/dev.mjs | Chạy song song Vite dev (:5173) và server (:3000) |
| scripts/smoke-test.mjs | `npm test` — 31 kiểm tra API/SSH/auth (không cần framework) |



==================================================

# Folder Rules

Folder: src/main/

Purpose: Node server — SSH engine, database, HTTP/WS API, IPC-style handlers

Do not modify: `src/main/ipc/*.ipc.ts` chỉ nên import `./ipc-bus` (không import `electron`).


Folder: src/renderer/

Purpose: React UI — components, stores, hooks, `lib/` (web-api, path-picker)

Do not modify: none


==================================================

# Commands

Install: npm install

Dev (Vite :5173 + server :3000): npm run dev

Build (SPA + server): npm run build

Run production server: npm start

Typecheck: npm run typecheck

Test (API + SSH + auth): npm test

Nếu better-sqlite3 báo lỗi NODE_MODULE_VERSION sau khi đổi phiên bản Node: `npm rebuild better-sqlite3`

Biến môi trường của server:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| TERMINUX_PORT | 3000 | Cổng HTTP |
| TERMINUX_HOST | 127.0.0.1 | Địa chỉ bind (đặt 0.0.0.0 nếu muốn truy cập từ máy khác) |
| TERMINUX_USER | admin | Tên đăng nhập Basic auth |
| TERMINUX_PASSWORD | (rỗng) | Bật xác thực; rỗng = không xác thực (chỉ nên dùng khi bind localhost) |
| TERMINUX_DATA_DIR | ./data | Nơi chứa DB, log phiên, khoá mã hoá, thư mục tạm/download |
| TERMINUX_FS_ROOT | (rỗng) | Khoá API filesystem trong một thư mục (chống path traversal) |
| TERMINUX_SECRET_KEY | (rỗng) | 64 ký tự hex, thay cho file data/secret.key |
| TERMINUX_WEB_DIR | ./dist/web | Thư mục chứa bản build giao diện |


==================================================

# Dependencies

Package: ssh2 — SSH protocol library (shell, sftp, tunnel)
Package: better-sqlite3 — Local database (native, phải rebuild theo ABI của Node)
Package: ws — WebSocket server (/api/events)
Package: adm-zip — Zip/unzip trên server (runtime dependency)
Package: xterm.js — Web-based terminal emulator
Package: @xterm/addon-fit — Auto-resize xterm to container
Package: zustand — State management
Package: lucide-react — Icons
Package: vite — Build SPA + dev server
Package: esbuild — Bundle server
Package: tailwindcss + autoprefixer — Styling (cấu hình ở gốc repo, vite config trỏ tới)


==================================================

# Code Patterns

Preferred patterns:
- All renderer ↔ server traffic qua `window.api` (web-api.ts) — không fetch trực tiếp trong component
- Server handlers đăng ký bằng `ipcMain.handle(channel, fn)` / `ipcMain.on(channel, fn)` trong src/main/ipc
- Push server → browser bằng `broadcast(channel, ...args)`
- SSH sessions identified by sessionId
- Database queries via prepared statements in handlers
- Zustand stores for all state (no prop drilling)
- Catppuccin Mocha dark theme (bg: #1e1e2e, fg: #cdd6f4)

Forbidden patterns:
- Import `electron` ở bất kỳ file nào (đã bỏ Electron hoàn toàn)
- Truy cập fs/child_process từ renderer
- Ghi/xoá file ngoài `TERMINUX_FS_ROOT` khi biến này được đặt


==================================================

# Security Notes

Important:
- Passwords are encrypted with AES-256-GCM (`src/main/crypto.ts`), key in `data/secret.key` (mode 600).
- Server binds 127.0.0.1 by default; set TERMINUX_PASSWORD before exposing it (HTTP Basic cho cả HTTP và WebSocket upgrade).
- WebSocket upgrade dùng header Authorization hoặc cookie `terminux_auth` (HMAC của user:password).
- Private key paths stored, not key contents.
- SSH agent forwarded via SSH_AUTH_SOCK.
- SSH timeout 10s via readyTimeout config.
- Path traversal guard: `assertInsideFsRoot()` trong src/main/paths.ts.
- Upload/download staging nằm trong `data/tmp` và `data/downloads`; `/api/download` chỉ phục vụ file trong `data/downloads`.


==================================================

# Performance Notes

Known bottlenecks:
- xterm.js writing large output can lag on slow connections — consider pausing output when tab not visible
- SQLite WAL mode enabled for concurrent reads


==================================================

# Known Issues

Issue: `better-sqlite3` / `ssh2` are native modules. Binary ABI phải khớp với Node đang chạy server.
Workaround:
1. `npm install`
2. Nếu gặp `ERR_DLOPEN_FAILED ... NODE_MODULE_VERSION`, chạy `npm rebuild better-sqlite3`.
3. Server cần Node 20+ (khuyến nghị Node 22). `cpu-features` là optional dependency của ssh2 — nếu build lỗi, ssh2 vẫn chạy bằng JS thuần.

Issue: Trước đây project dùng `electron-rebuild` để build native module cho Electron ABI; script đó đã bị xoá cùng Electron.
Nếu thấy binary cũ trong node_modules được build cho Electron, chạy `npm rebuild better-sqlite3` để build lại cho Node.



==================================================

# AI Notes

Future AI agents should know:
- Project đã bỏ Electron: KHÔNG import `electron`, KHÔNG dùng preload/contextBridge, KHÔNG có `npm run dist`.
- `window.api` là do `src/renderer/lib/web-api.ts` cài đặt ở browser. Type của nó nằm ở `src/renderer/types/index.ts`.
- Muốn thêm một chức năng mới: đăng ký handler trong `src/main/ipc/*.ipc.ts` bằng `ipcMain.handle`, rồi thêm method tương ứng vào `src/renderer/lib/web-api.ts` và type trong `src/renderer/types/index.ts`.
- Sự kiện đẩy từ server: gọi `broadcast('ten:kenh', ...args)`; phía browser subscribe bằng `on('ten:kenh', cb)`.
- `ipcMain.on` listener nhận `(event, ...args)` giống Electron — `ipc-bus.send()` tự thêm tham số event đầu tiên.
- Các panel "Local" (SftpPanel, DeployDialog) giờ là filesystem của máy chạy server, không phải máy người dùng.
- Chọn file/thư mục không dùng dialog native nữa mà dùng `src/renderer/lib/path-picker.ts` (modal DOM thuần).
- Upload/download: browser → `/api/upload` → SFTP; SFTP → `data/downloads` → `/api/download` (client tự bấm link tải).
- `vite.config.ts` đặt `root: src/renderer` nên PostCSS/Tailwind được nạp thủ công từ gốc repo.
- Chạy `npm test` trước khi kết thúc: nó dựng server thật + SSH server giả và kiểm tra cả luồng terminal.
- Panel mới (2026-10-23): **FTP Accounts** (quản lý tài khoản FTP, cài vsftpd, chroot, passive port, mở firewall), **Firewall** (đa engine: UFW / firewalld / nftables / iptables + fail2ban), **Database** (thêm tab Người dùng: tạo/xoá user MySQL-PostgreSQL, cấp quyền, xem grants; và trình cài MariaDB/PostgreSQL/Redis), **System Users**, **Multi-Exec**.
- Panel **System Users** và **Multi-Exec** trước đây đã có file nhưng KHÔNG được import ở đâu (tính năng chết) — nay đã nối vào menu nhóm "Mạng & Tiện ích".
- Khi truyền mật khẩu / SSH key / nội dung file qua `exec()` trong các panel, luôn dùng `echo '<base64>' | base64 -d | ...` để tránh shell diễn giải ký tự đặc biệt (đã áp dụng ở FtpPanel, DatabasePanel, UserManagementPanel).
- This is greenfield project, no legacy code.
- Catppuccin Mocha theme colors: bg #1e1e2e, surface #181825, surface1 #313244, overlay0 #6c7086, subtext0 #a6adc8, text #cdd6f4.
- Built-in themes: One Dark, Solarized Dark, Dracula, Catppuccin Mocha.
- Schema uses TEXT for all datetimes (SQLite has no native datetime type).
- Auth methods: password, key, agent.
- Tabs remember their full connection configuration in `TerminalTab.config` for Reconnect operations.
- Reconnection is supported via a Reconnect Overlay when a session disconnects, or via right-click context menu.
- If a connection fails to establish, the server broadcasts `shell:error` before returning so that the error displays inside the terminal.
- Prompting for passwords dynamically when `authMethod === 'password'` and `password` is empty is supported.
- DevOps Dashboard has been updated to be fully responsive: the sub-tabs header was replaced with a vertical Left Sub-Sidebar (Option B) that groups the 18 features (Overview, Processes, PM2, Docker, Nginx, Cron Jobs, Git & Deploy, SFTP, Database, Backup, Tunnel, Packages, Logs, Services, Firewall, SSL Tracker, Alerts) into 4 system categories (System, Apps, Data, Network) for optimal navigation without scrolling.
- OverviewPanel cards/gauges/details use responsive grid breakpoints (sm/lg/etc.) to wrap nicely on resize.
- Docker, PM2, and Nginx panels feature automatic installers: when these tools are missing on the remote host, the panel displays a status warning and an installer button. The installer runs via sudo SSH commands, streams logs in real-time, and refreshes the panel state on completion.
- `RemotePathPicker` is a reusable pattern implemented in `NginxPanel`, `DockerPanel` (for compose directory path picking), and `GitPanel` to browse files/directories on the remote host.
- DockerPanel: Supports Docker Compose editing, Up/Down/Restart controls, and Interactive Terminal (`docker exec -it` inside new SSH xterm tab).
- NginxPanel: Integrated with an automated Certbot Wizard to install Certbot and generate Let's Encrypt certificates for sites in 1-click.
- DatabasePanel: Tích hợp Redis Key-Value Explorer (scan keys, read string/hash/list/set/zset type & value, delete key) và Database Backup/Restore (export, import cho MySQL & PostgreSQL).
- BackupPanel: Tích hợp thiết lập lịch Cron Backup tự động và ghi đè trực tiếp vào crontab của server SSH.
- FirewallPanel: Quản lý tường lửa UFW trực quan (bật/tắt, xem quy tắc, thêm rule cấm/cho phép theo IP & cổng mạng, xóa rule).
- GitPanel: Quản lý danh sách repo Git, theo dõi trạng thái branch, modified files, commit history và chạy lệnh Pull/Fetch/Reset Hard/Deploy tự động.
- SslTrackerPanel: Theo dõi danh sách tên miền website, tự động đọc và tính toán ngày hết hạn SSL qua `openssl` từ xa.
- SFTP Optimization: Truyền tải tệp tin (upload/download) được tối ưu hóa chạy song song (concurrency limit = 10). Các thư mục đích được quét và khởi tạo một lần duy nhất trước khi truyền tải tệp để giảm tải tối đa độ trễ mạng (network latency) từ các lệnh mkdir trùng lặp.
- DevOps Dashboard has been updated to be fully responsive: the sub-tabs header was replaced with a vertical Left Sub-Sidebar (Option B) that groups the 18 features (Overview, Processes, PM2, Docker, Nginx, Cron Jobs, Git & Deploy, SFTP, Database, Backup, Tunnel, Packages, Logs, Services, Firewall, SSL Tracker, Alerts) into 4 system categories (System, Apps, Data, Network) for optimal navigation without scrolling.
- OverviewPanel cards/gauges/details use responsive grid breakpoints (sm/lg/etc.) to wrap nicely on resize.
- Docker, PM2, and Nginx panels feature automatic installers: when these tools are missing on the remote host, the panel displays a status warning and an installer button. The installer runs via sudo SSH commands, streams logs in real-time, and refreshes the panel state on completion.
- `RemotePathPicker` is a reusable pattern implemented in `NginxPanel`, `DockerPanel` (for compose directory path picking), and `GitPanel` to browse files/directories on the remote host.
- DockerPanel: Supports Docker Compose editing, Up/Down/Restart controls, and Interactive Terminal (`docker exec -it` inside new SSH xterm tab).
- NginxPanel: Integrated with an automated Certbot Wizard to install Certbot and generate Let's Encrypt certificates for sites in 1-click.
- DatabasePanel: Tích hợp Redis Key-Value Explorer (scan keys, read string/hash/list/set/zset type & value, delete key) và Database Backup/Restore (export, import cho MySQL & PostgreSQL).
- BackupPanel: Tích hợp thiết lập lịch Cron Backup tự động và ghi đè trực tiếp vào crontab của server SSH.
- FirewallPanel: Quản lý tường lửa UFW trực quan (bật/tắt, xem quy tắc, thêm rule cấm/cho phép theo IP & cổng mạng, xóa rule).
- GitPanel: Quản lý danh sách repo Git, theo dõi trạng thái branch, modified files, commit history và chạy lệnh Pull/Fetch/Reset Hard/Deploy tự động.
- SslTrackerPanel: Theo dõi danh sách tên miền website, tự động đọc và tính toán ngày hết hạn SSL qua `openssl` từ xa.
- SFTP Optimization: Truyền tải tệp tin (upload/download) được tối ưu hóa chạy song song (concurrency limit = 10). Các thư mục đích được quét và khởi tạo một lần duy nhất trước khi truyền tải tệp để giảm tải tối đa độ trễ mạng (network latency) từ các lệnh mkdir trùng lặp.





