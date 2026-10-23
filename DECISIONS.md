# Architecture Decisions


Only record permanent decisions.


==================================================


## Template


Date:


Decision:


Context:


Reason:


Rejected alternatives:


Impact:


==================================================


# Records


==================================================


Date: 2026-10-23

Decision: Chuyển Terminux từ ứng dụng desktop Electron (build .exe cho Windows) sang ứng dụng web chạy trên Node.js server.

Context:

- Trước đây: Electron main process (src/main) + preload contextBridge (src/preload) + renderer React, đóng gói bằng electron-builder thành .exe cho Windows.
- Yêu cầu: bỏ build Windows, chạy trên web.

Reason:

- Chỉ cần một chỗ chạy là máy chủ Node.js, truy cập bằng trình duyệt từ bất kỳ máy nào (kể cả điện thoại/tablet), không phải cài đặt.
- Toàn bộ nghiệp vụ (ssh2, better-sqlite3, SFTP, tunnel, DevOps panels) vốn đã chạy ở phía server nên giữ nguyên được.

Cách làm (giữ thay đổi ở mức tối thiểu):

1. Thay `ipcMain` của Electron bằng shim `src/main/ipc/ipc-bus.ts` (cùng chữ ký `handle`/`on`). Vì vậy 8 file `src/main/ipc/*.ipc.ts` gần như không phải sửa logic, chỉ đổi 1 dòng import.
2. Thay `webContents.send` bằng `broadcast()` → WebSocket `/api/events`.
3. Thay preload/contextBridge bằng `src/renderer/lib/web-api.ts` (cài `window.api` trong browser). Toàn bộ component React không phải sửa.
4. `app.getPath('userData')` → `src/main/paths.ts` (thư mục `./data`, override bằng `TERMINUX_DATA_DIR`).
5. `safeStorage` → AES-256-GCM trong `src/main/crypto.ts` (khoá `data/secret.key`, override bằng `TERMINUX_SECRET_KEY`).
6. `dialog.showOpenDialog/showSaveDialog` → modal chọn đường dẫn nội bộ (`src/renderer/lib/path-picker.ts`) + HTTP `/api/upload`, `/api/download`.
7. Build: electron-vite/electron-builder → `vite` (SPA vào `dist/web`) + `esbuild` (server vào `dist/server`).
8. Thêm xác thực HTTP Basic (`TERMINUX_PASSWORD`) cho cả HTTP và WebSocket, bind mặc định `127.0.0.1`, và tuỳ chọn khoá filesystem bằng `TERMINUX_FS_ROOT`.

Rejected alternatives:

- Giữ Electron và chỉ mở cổng HTTP: vẫn phải build/cài .exe, không đúng yêu cầu.
- SSH trực tiếp từ browser (WebSSH thuần client): browser không mở được TCP thô, bắt buộc phải có backend.
- Thêm Express/Socket.IO: không cần thiết, `node:http` + `ws` là đủ và ít phụ thuộc hơn.
- Viết lại renderer: không cần, chỉ thay lớp cầu nối `window.api`.

Impact:

- `src/preload/` bị xoá; `electron`, `electron-builder`, `electron-rebuild`, `electron-vite` bị xoá khỏi package.json.
- `adm-zip` chuyển từ devDependencies sang dependencies (trước đây bị thiếu khi đóng gói).
- Các panel "Local" giờ thao tác trên filesystem của máy chạy Terminux (trước đây là máy người dùng).
- Upload: trình duyệt → `/api/upload` (thư mục tạm trên server) → SFTP. Download: SFTP → `data/downloads` → trình duyệt tải qua `/api/download`.
- Kiểm thử: `npm test` (31 kiểm tra, gồm cả luồng SSH thật với SSH server giả).

