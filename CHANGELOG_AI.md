# AI Change Log


Every AI modification.


==================================================


Date: 2026-10-23
AI: Cline (Claude)
Task: Rà soát và hoàn thiện bộ panel quản trị (firewall đa engine, FTP, user database, cài engine DB)
Files added:
- src/renderer/components/devops/FtpPanel.tsx (quản lý tài khoản FTP: vsftpd/pure-ftpd/proftpd, cài đặt, tạo/xoá/khoá user, chroot, passive ports, sửa cấu hình, mở firewall)
- src/renderer/components/devops/RemotePathPicker.tsx (component duyệt tệp/thư mục trên server dùng chung)
Files changed:
- src/renderer/components/devops/FirewallPanel.tsx (viết lại: UFW + firewalld + nftables + iptables + fail2ban, chính sách mặc định, log, cài engine)
- src/renderer/components/devops/DatabasePanel.tsx (thêm tab Người dùng DB: liệt kê/tạo/xoá user MySQL-PostgreSQL, cấp quyền, đổi mật khẩu, xem grants; thêm trình cài MariaDB/PostgreSQL/Redis ở màn hình trống)
- src/renderer/components/devops/DevOpsDashboard.tsx (nối FtpPanel, UserManagementPanel, MultiExecPanel vào menu; thêm nhóm menu)
- src/renderer/components/devops/MultiExecPanel.tsx (nhận props chuẩn của dashboard, dùng prop exec, hiển thị đúng tên máy chủ, trạng thái đang chạy, exit code)
- src/renderer/components/devops/UserManagementPanel.tsx (dùng base64 cho mật khẩu + SSH key, thêm lựa chọn shell khi tạo user, báo lỗi rõ ràng)
- memory.md
What changed:
- Hoàn thiện quản trị toàn diện: tường lửa mọi engine phổ biến, quản lý tài khoản FTP, quản lý user database, cài đặt MySQL/PostgreSQL/Redis ngay trong panel.
- Sửa lỗi tính năng chết: `MultiExecPanel` và `UserManagementPanel` đã có file nhưng không được import ở đâu → nay truy cập được từ menu.
- Sửa lỗi shell injection/quoting: mật khẩu và SSH key truyền qua shell nay được mã hoá base64 (`base64 -d | chpasswd` / `tee`), mật khẩu có ký tự đặc biệt không còn làm hỏng lệnh.
- Tách `RemotePathPicker` dùng chung cho các panel mới thay vì copy thêm.
Reason: Yêu cầu rà soát, hoàn thiện và bổ sung panel quản trị (firewall các loại, FTP account, database user, cài mysql/postgres/redis).
Risk: Trung bình — các panel chạy lệnh sudo trên máy chủ đích; mọi thao tác phá hoại đều có bước xác nhận.
Verification: `npx tsc --noEmit` sạch; `npm run build` thành công (SPA + server bundle); `npm test` → 31/31 pass; kiểm tra chuỗi trong bundle xác nhận các panel mới đã được đóng gói.


==================================================


Date: 2026-10-23
AI: Cline (Claude)
Task: Chuyển Terminux từ app desktop Electron (build .exe Windows) sang web app chạy trên Node.js
Files added:
- src/main/index.ts (viết lại: HTTP + WebSocket server, Basic auth, static SPA, upload/download)
- src/main/ipc/ipc-bus.ts (shim `ipcMain` + `broadcast` thay Electron IPC)
- src/main/paths.ts (data dir, session logs, temp, filesystem jail)
- src/main/crypto.ts (AES-256-GCM thay `safeStorage`)
- src/main/downloads.ts (staging download + URL /api/download)
- src/renderer/lib/web-api.ts (browser implementation của `window.api`)
- src/renderer/lib/path-picker.ts (modal chọn file/thư mục trên máy chủ)
- vite.config.ts, scripts/build.mjs, scripts/build-server.mjs, scripts/dev.mjs, scripts/smoke-test.mjs
Files changed:
- package.json (bỏ electron/electron-builder/electron-rebuild/electron-vite; thêm ws, esbuild, @types/node, @types/ws; đổi scripts sang vite/esbuild/node)
- src/main/db/index.ts, src/main/ssh/ssh-manager.ts, src/main/ssh/shell-session.ts (bỏ `app.getPath`/`BrowserWindow`)
- src/main/ipc/{app,db,ssh,sftp,tunnel,port,local}.ipc.ts (import ./ipc-bus; bỏ dialog/clipboard/safeStorage; broadcast progress; upload/download qua HTTP)
- src/renderer/main.tsx (installWebApi), src/renderer/App.tsx (background image qua /api/file), src/renderer/components/layout/TitleBar.tsx (ẩn nút cửa sổ trên web)
- memory.md, DECISIONS.md, .gitignore
Files removed:
- src/preload/index.ts, electron.vite.config.ts, electron.vite.config.1782873572180.mjs, out/ (output Electron cũ)
What changed:
- Thay toàn bộ lớp truyền thông Electron IPC bằng HTTP (`/api/invoke`, `/api/send`) + WebSocket (`/api/events`).
- Thêm xác thực HTTP Basic cho HTTP và WebSocket upgrade; bind mặc định 127.0.0.1.
- Thêm khoá filesystem tuỳ chọn (TERMINUX_FS_ROOT) chống path traversal.
- File picker của Electron thay bằng modal nội bộ + HTTP upload/download.
- Build tách thành SPA (`dist/web`) + server bundle (`dist/server`).
Reason: Yêu cầu bỏ build ứng dụng Windows, chạy trên web.
Risk: Trung bình — thay đổi kiến trúc, nhưng giữ nguyên toàn bộ logic nghiệp vụ SSH/SFTP/DB.
Verification: `npm run typecheck` sạch; `npm run build` thành công; `npm test` → 31/31 kiểm tra pass (bao gồm luồng SSH thật với SSH server giả, broadcast WebSocket, xác thực và filesystem jail).


==================================================


Date: 2026-06-30
AI: Antigravity (Gemini 3.5 Flash)
Task: Nâng cấp toàn diện DevOps Dashboard hoàn thiện tính năng cho DevOps (7 tính năng)
Files changed:
- [DevOpsDashboard.tsx](file:///c:/Users/fpt/Documents/terminux/src/renderer/components/devops/DevOpsDashboard.tsx)
- [memory.md](file:///c:/Users/fpt/Documents/terminux/memory.md)
What changed:
- Cấu hình thêm 6 sub-tab mới (Processes, Cron Jobs, Multi-Exec, Packages, Alerts, Backup) và tích hợp Nginx Config Wizard trực tiếp vào tab Nginx.
- Thiết lập gọi lệnh hệ thống qua SSH, tích hợp cơ chế polling và lưu cấu hình Webhook/cảnh báo trực tiếp trong bảng SQLite cục bộ `app_settings`.
- Bổ sung tài liệu sửa lỗi cài đặt `npm install` trên Node v24 vào `memory.md`.
Reason: Hoàn thiện tính năng quản trị VPS trực quan, hỗ trợ tối đa kỹ sư DevOps vận hành máy chủ từ xa tiện lợi hơn.
Risk: Rất thấp. Các lệnh SSH chạy an toàn thông qua command exec phi tương tác độc lập.
Verification: Chạy `npm run build` thành công, biên dịch 100% không có lỗi TypeScript hay cú pháp.


==================================================
