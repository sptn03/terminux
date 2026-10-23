# Phân tích chức năng của Termius

## 1. Tổng quan

Termius là một SSH client đa nền tảng dùng để kết nối, quản lý và thao
tác với các máy chủ từ xa như VPS, Linux Server, Cloud Server hoặc thiết
bị mạng.

Ứng dụng cung cấp giao diện quản lý thay cho việc sử dụng SSH bằng dòng
lệnh thuần túy.

------------------------------------------------------------------------

## 2. Chức năng kết nối SSH

Đây là chức năng chính của Termius.

Termius cho phép:

-   Kết nối tới server từ xa thông qua giao thức SSH.
-   Đăng nhập và thực thi lệnh trên máy chủ.
-   Quản trị hệ thống Linux/Unix.
-   Quản lý VPS, cloud server và thiết bị mạng.

Thông tin kết nối được lưu lại:

-   Hostname/IP
-   Port SSH
-   Username
-   Phương thức xác thực

------------------------------------------------------------------------

## 3. Quản lý nhiều máy chủ (Host Manager)

Termius hỗ trợ lưu và tổ chức nhiều máy chủ.

Các thông tin có thể quản lý:

-   Địa chỉ server
-   Cổng kết nối
-   Tài khoản đăng nhập
-   SSH key
-   Nhãn phân loại (tag)

Ví dụ phân nhóm:

    Production
     ├── Web Server
     ├── Database Server
     └── Backup Server

    Development
     ├── Test Server
     └── API Server

Giúp DevOps hoặc quản trị viên dễ quản lý nhiều hệ thống.

------------------------------------------------------------------------

## 4. Quản lý SSH Key và bảo mật

Termius hỗ trợ xác thực bằng khóa SSH.

Chức năng:

-   Lưu private key.
-   Quản lý public key.
-   Sử dụng xác thực không cần mật khẩu.
-   Bảo vệ thông tin đăng nhập.

Ưu điểm:

-   Tăng bảo mật.
-   Giảm nguy cơ brute force password.

------------------------------------------------------------------------

## 5. Truyền file qua SFTP

Termius tích hợp SFTP để quản lý file trên server.

Cho phép:

-   Upload file.
-   Download file.
-   Xóa file.
-   Tạo thư mục.
-   Quản lý dữ liệu từ xa.

Ví dụ:

Upload website lên thư mục:

    /var/www/html/

mà không cần dùng lệnh SCP.

------------------------------------------------------------------------

## 6. SSH Tunnel và Port Forwarding

Termius hỗ trợ tạo đường hầm SSH.

Ứng dụng:

-   Truy cập dịch vụ nội bộ.
-   Kết nối database không public.
-   Chuyển tiếp cổng mạng an toàn.

Ví dụ:

Laptop → SSH Tunnel → Server → Database

Cho phép truy cập database nội bộ thông qua kết nối SSH.

------------------------------------------------------------------------

## 7. Quản lý phiên làm việc Terminal

Termius hỗ trợ:

-   Nhiều tab terminal.
-   Nhiều phiên SSH cùng lúc.
-   Chuyển đổi nhanh giữa các server.

Ví dụ:

    Tab 1: Web Server
    Tab 2: Database
    Tab 3: Docker Log

------------------------------------------------------------------------

## 8. Snippets (lưu lệnh nhanh)

Termius cho phép lưu các câu lệnh thường dùng.

Ví dụ:

``` bash
sudo systemctl restart nginx
```

hoặc:

``` bash
docker compose up -d
```

Giúp tiết kiệm thời gian thao tác.

------------------------------------------------------------------------

## 9. Đồng bộ đa nền tảng

Termius hỗ trợ:

-   Windows
-   macOS
-   Linux
-   Android
-   iOS

Có thể đồng bộ:

-   Danh sách server.
-   SSH key.
-   Cấu hình kết nối.

------------------------------------------------------------------------

## 10. Hỗ trợ làm việc nhóm

Các tính năng cho nhóm:

-   Chia sẻ server.
-   Quản lý quyền truy cập.
-   Quản lý thông tin xác thực tập trung.

Phù hợp với:

-   DevOps team.
-   System Administrator.
-   Developer.

------------------------------------------------------------------------

## 11. Mô hình chức năng tổng quát

                     Termius
                        |
        ┌───────────────┼───────────────┐
        |               |               |
     SSH Terminal     SFTP          Security
        |               |               |
     Remote Shell   File Transfer   SSH Key
        |
     Server Management
        |
     Linux / Cloud / VPS

------------------------------------------------------------------------

## 12. Đánh giá

### Ưu điểm

-   Giao diện thân thiện.
-   Quản lý nhiều server dễ dàng.
-   Có sẵn SFTP.
-   Hỗ trợ nhiều nền tảng.
-   Hữu ích cho DevOps.

### Nhược điểm

-   Một số tính năng nâng cao cần trả phí.
-   Có thể dư thừa nếu chỉ dùng SSH đơn giản.

------------------------------------------------------------------------

## 13. Chạy Terminux dưới dạng web app

Ứng dụng chạy như một web server bằng Node.js, mở bằng trình duyệt (không cần
cài đặt, không build .exe).

### Cài đặt & chạy

```bash
npm install
npm run build     # build giao diện (dist/web) + server (dist/server)
npm start         # chạy server, mặc định http://127.0.0.1:3000
```

Chế độ phát triển (hot reload):

```bash
npm run dev       # Vite :5173 (giao diện) + server :3000 (API/SSH)
# mở http://localhost:5173
```

Kiểm thử: `npm test` (31 kiểm tra API + SSH + xác thực)

### Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `TERMINUX_PORT` | `3000` | Cổng HTTP |
| `TERMINUX_HOST` | `127.0.0.1` | Địa chỉ bind (dùng `0.0.0.0` để truy cập từ máy khác) |
| `TERMINUX_USER` / `TERMINUX_PASSWORD` | `admin` / (rỗng) | Đăng nhập HTTP Basic. **Bắt buộc đặt** nếu mở ra ngoài localhost |
| `TERMINUX_DATA_DIR` | `./data` | Nơi chứa database, log phiên, khoá mã hoá, tệp tạm |
| `TERMINUX_FS_ROOT` | (rỗng) | Giới hạn API filesystem trong một thư mục |
| `TERMINUX_WEB_DIR` | `./dist/web` | Thư mục chứa bản build giao diện |

Ví dụ chạy cho cả LAN:

```bash
TERMINUX_HOST=0.0.0.0 TERMINUX_PASSWORD='mat-khau-manh' npm start
```

### Lưu ý khi chuyển từ bản desktop sang web

- Trang **SFTP / Local** giờ thao tác trên ổ đĩa của **máy chạy server**, không
  phải máy người dùng. Upload: trình duyệt → thư mục tạm trên server → SFTP.
  Download: SFTP → `data/downloads` → trình duyệt tải về.
- Nút thu nhỏ / phóng to / đóng cửa sổ không còn (dùng tab của trình duyệt).
- Chọn private key / thư mục dùng hộp thoại chọn đường dẫn trong ứng dụng.

------------------------------------------------------------------------

## Kết luận

Termius là một công cụ quản lý SSH toàn diện, kết hợp terminal, truyền
file, bảo mật khóa SSH và quản lý server trong một ứng dụng duy nhất.
