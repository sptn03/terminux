# AI Change Log


Every AI modification.


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
