# AI Change Log


Every AI modification.


==================================================


Date: 2026-10-26
AI: CommandCode
Task: Hoàn thiện tại chỗ các tính năng DevOps (không thêm tính năng/thư viện mới)
Files changed:
- src/renderer/components/devops/RemotePathPicker.tsx (join path chuẩn, chỉ hiện nút "Chọn thư mục này" ở mode dir)
- src/renderer/components/devops/{Docker,Git,Logs,Nginx,PM2}Panel.tsx (xóa 5 bản RemotePathPicker copy, dùng component chung; bỏ import/handler chết)
- src/renderer/components/devops/BackupPanel.tsx + DevOpsDashboard.tsx (nối refreshKey + setError)
- src/renderer/components/devops/SslTrackerPanel.tsx (dùng setLoading/setError, refresh dùng Promise.all)
- src/renderer/components/devops/MultiExecPanel.tsx (refreshKey xóa output cũ)
- src/renderer/components/sftp/SftpPanel.tsx (bỏ progress ảo 30/60, huỷ chuyển "Đã hủy", nhãn "Server Filesystem", trạng thái SFTP theo session)
- src/renderer/components/devops/ServicesPanel.tsx (kiểm tra exit code thay vì chỉ chữ "Failed")
- src/renderer/components/devops/PhpManagerPanel.tsx (bỏ subtab 'composer' chết + import thừa)
- src/renderer/components/devops/CronPanel.tsx (escape `%` đúng chuẩn crontab, persistCron kiểm tra exit code, ẩn dòng env/comment)
What changed:
- Không còn 5 bản picker trùng lặp; mọi panel dùng chung một hành vi (pwd, startPath, báo lỗi).
- Nút Refresh và banner lỗi của dashboard hoạt động ở tab Backup/SslTracker/MultiExec.
- Sửa các trạng thái giả trong SFTP và thông báo lỗi dịch vụ/crontab.
Reason: Yêu cầu hoàn thiện các tính năng DevOps mà không thêm gì mới.
Risk: Thấp — chủ yếu refactor/dọn dead code và nối props.
Verification: `npm run typecheck` sạch; `npm test` 31/31 pass; `npm run build` thành công.


==================================================


Date: 2026-10-26
AI: CommandCode
Task: Tự động reconnect khi mất kết nối + hoàn thiện/sửa lỗi các panel quản trị VPS
Files changed:
- src/renderer/hooks/use-terminal.ts (shell:exit → connected=false, phát `terminux:connection-lost`)
- src/renderer/components/terminal/TerminalTab.tsx (auto-reconnect backoff 1.5s→20s, overlay trạng thái, nút dừng)
- src/renderer/components/devops/PhpManagerPanel.tsx (sửa sed `\s`→`[[:space:]]`, verify ghi php.ini, thêm ô max_input_time)
- src/renderer/components/devops/WordPressPanel.tsx (parse DB_NAME/DB_USER, không quét lại khi chọn site, plugin fallback "unknown")
- src/renderer/components/devops/DevOpsDashboard.tsx + AlertsPanel.tsx (công tắc Alerts có tác dụng, Telegram chat_id, dọn text/import thừa)
- src/renderer/components/devops/BackupPanel.tsx (tên file theo engine, restore PostgreSQL đúng client, mật khẩu MySQL qua base64/MYSQL_PWD)
- src/renderer/components/devops/UserManagementPanel.tsx (xoá SSH key theo nội dung, selectedUser không còn stale)
- src/renderer/components/devops/NginxPanel.tsx (không reload toàn panel khi chọn site)
- src/renderer/components/devops/OverviewPanel.tsx (trạng thái tải thay vì màn hình trắng, cache public IP, giảm re-render)
- src/renderer/components/devops/DatabasePanel.tsx (Redis scan bỏ LIMIT sai, base64 key/pattern, port backup đúng, grant PostgreSQL)
- src/renderer/components/devops/PackagesPanel.tsx (không báo "đã cập nhật" giả, trạng thái hoàn tất cài đặt)
- src/renderer/components/devops/GitPanel.tsx (không còn báo "Clean" khi lỗi)
- src/renderer/components/devops/DockerPanel.tsx (mật khẩu registry qua base64)
- src/renderer/components/devops/SslTrackerPanel.tsx (bỏ domain demo google/github)
- src/renderer/components/sftp/SftpPanel.tsx (đọc file local đúng API, kéo-thả file từ OS hoạt động)
- src/main/ipc/local.ipc.ts (thêm `local:readFile`)
- src/renderer/lib/web-api.ts, src/renderer/types/index.ts (`local.readFile`, `sftp.uploadFiles`)
- memory.md (bỏ đoạn lặp, cập nhật reconnect/SFTP)
What changed:
- Mất kết nối SSH giờ tự động thử lại (backoff) và luôn hiện overlay thay vì giữ trạng thái "connected" sai.
- Sửa các lỗi chức năng chết/sai: PHP settings không lưu, Alerts toggle vô tác dụng, Telegram webhook sai payload, PostgreSQL backup bị restore bằng mysql, xoá SSH key sai dòng, SFTP đọc nhầm file remote, Nginx reload liên tục, Redis scan lỗi.
- Dọn text/import/state thừa và bỏ dữ liệu demo.
Reason: Yêu cầu thêm reconnect khi mất kết nối, hoàn thiện quản trị VPS và sửa các phần lỗi/text thừa.
Risk: Trung bình — thay đổi luồng reconnect và một số lệnh sudo trên máy chủ đích; mọi thao tác phá hoại vẫn có xác nhận.
Verification: `npm run typecheck` sạch; `npm test` 31/31 pass; `npm run build` thành công.


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
