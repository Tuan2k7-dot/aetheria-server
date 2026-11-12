# CHRONO TOWER: GEM OF AETHER — V39.0.1 Release Candidate

Bản phát hành thử nghiệm HTML5, kế thừa gameplay V37.3.4. V38.0–V39.0.1 bổ sung lớp nhận diện sản phẩm, hướng dẫn mở khóa, biến thể đấu trường, Cloud Save qua server và biên nhận Raid. Đây **chưa phải bản đã được CrazyGames/Poki duyệt**, chưa có xác nhận pháp lý IP, và chưa phải co-op Canvas hoàn chỉnh.

## Thành phần

- `public/index.html`: game HTML5 100 tầng, progressive onboarding, modifier tầng 1–40, khiên nguyên tố Boss, tài khoản online và Cloud Save.
- `server.js`: Express + Socket.IO + Supabase Auth, thành phố online, khung Party/Raid server-authoritative, Cloud API và Raid receipts.
- `supabase/migrations/001_v39_release.sql`: bảng Cloud Profile có revision/CAS và bảng biên nhận Raid chỉ server được ghi.
- `RELEASE_CHECKLIST.md`, `CHANGELOG.md`, `QA_RESULTS.md`: phạm vi, thay đổi và trạng thái kiểm thử.
- `V39.0.1`: sửa khóa tài khoản mẫu, nhãn roster còn sót và Break khiên nguyên tố đánh sai hệ.

## Chạy local

Yêu cầu Node.js 20 trở lên.

```bash
npm install
cp .env.example .env
# Điền thông tin Supabase trong .env
npm run check
npm start
```

Mở `http://localhost:3000`; endpoint trạng thái là `/healthz`.

## Triển khai Render

1. Tạo branch/repository release riêng và sao lưu dự án cũ trước khi thay source.
2. Giữ đúng cấu trúc `server.js`, `package.json`, `public/index.html`, `supabase/migrations/`.
3. Trong Supabase SQL Editor, chạy `supabase/migrations/001_v39_release.sql`.
4. Tạo Render Web Service, Build Command `npm install`, Start Command `npm start`, Node 20+.
5. Cấu hình Environment Variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`.
6. Chỉ đặt Service Role Key trong biến môi trường Render. Không đưa key này vào HTML, `online-config.js`, GitHub hoặc trình duyệt.
7. Kiểm tra `/healthz`; cần `authConfigured:true` và `cloudSaveConfigured:true`.
8. Kiểm tra đăng ký/đăng nhập, Cloud Save/Restore, xung đột revision, mở thành phố trên hai tài khoản và xác nhận biên nhận Raid.

## Phạm vi bảo mật đã thiết kế

- Client gửi Cloud Profile đến `/api/v39/profile`; server xác minh Supabase access token, giới hạn payload 90 KB, lọc trường, giới hạn giá trị và kiểm tra revision trước khi lưu.
- Cloud Save là bản sao lưu tiến trình chơi đơn đã giới hạn cấu trúc. Những trường do client cung cấp không chứng minh được người chơi thực sự đã đánh Boss hay kiếm được Col. Không dùng dữ liệu này làm bảng xếp hạng cạnh tranh, giải thưởng trả phí hoặc căn cứ giao dịch.
- Raid online yêu cầu Service Role/database hoạt động. Server tính sát thương và phần thưởng; biên nhận Raid phải ghi thành công vào Supabase trước khi server phát sự kiện phần thưởng. `v37:loot_ack` cập nhật `acknowledged_at` trước khi xóa phần thưởng chờ trong bộ nhớ.
- Party/Raid room state hiện vẫn ở RAM. Render restart hoặc chạy nhiều instance có thể làm mất trạng thái trận/phòng đang hoạt động; cần Redis/Postgres state machine và kiểm thử multi-instance trước khi mở quy mô lớn.
- Các handler Party/Raid server có sẵn chưa được nối thành trải nghiệm co-op trực tiếp với toàn bộ game Canvas trong bản này. Build hiện là chơi đơn + Thành phố/Chat online; không quảng bá là MMORPG co-op hoàn chỉnh.

## Giới hạn phát hành

- Đổi tên không tạo ra quyền sở hữu IP. Cần rà soát thủ công toàn bộ hình ảnh, sprite, thiết kế nhân vật/Boss, cốt truyện, âm thanh, font và thư viện bên thứ ba; cần kiểm tra nhãn hiệu/tên miền cho tên sản phẩm. Các ID nội bộ cũ được giữ lại để tránh phá save.
- Chưa chạy migration trên Supabase thật, chưa có credentials Render, chưa thử full interactive playthrough trong trình duyệt, chưa test mobile/tablet và chưa tích hợp SDK quảng cáo/đối tác CrazyGames/Poki.
- Chính sách quyền riêng tư trong package là template, cần hoàn thiện chủ thể vận hành, email hỗ trợ, thời hạn lưu trữ và quy trình xóa dữ liệu trước khi công khai.

Bản này là **Release Candidate để kiểm thử và nộp xét duyệt**, không được xem là đã qua kiểm duyệt nền tảng hoặc kiểm toán bảo mật độc lập.
