# CHRONO TOWER: GEM OF AETHER — V39.0.1 RC Technical Review

Ngày cập nhật: 12-11-2026.

## Ba lỗi nghiệm thu đã sửa

1. **Seed account:** `ACCOUNTS_DB` dùng cùng khóa và username `Kaelen_Chrono`. `loginExistingAccount()` nạp `acc.username`, còn `saveCurrentAccountSnapshot()` ghi theo `G.player.name`, nên snapshot đầu không tạo thêm `Kaelen`.
2. **Roster labels:** các nhãn hiển thị Agil/Sinon được đổi thành Valerius/Sylvia; Alice/Klein trong roster phụ được đổi thành Aurelia/Darian. Các ID nội bộ (`agil`, `sinon`, `alice`, `klein`) và asset keys không đổi để tránh làm gãy liên kết tương thích.
3. **Elemental Shield Break:** khiên còn hoạt động từ chối Stagger do vũ khí sai hệ. Vũ khí đúng hệ tiếp tục tích Break. Perfect/regular Parry có `bypassElementShield` tường minh để không bị khóa Break phòng thủ. Khiên đã vỡ hoặc enemy không có khiên hoạt động thì logic Stagger cũ được giữ.

## Kiểm tra đã thực hiện

- 34 thẻ script HTML; 32 thẻ có nội dung. Cả 32 script qua `node --check`.
- Không có DOM ID trùng lặp.
- `server.js` qua `node --check`; `package.json` parse hợp lệ.
- Node harness trích đúng helper và `addStaggerToEnemy()` từ source: 6/6 kịch bản PASS (sai hệ, đúng hệ, Parry override, shield đã vỡ, enemy không có shield).
- Static account/roster check: key và username seed đồng nhất; không còn chuỗi hiển thị `Kaelen_SAO`, `Agil`, `Sinon`, `Alice`, `Klein`.
- In-game V39 self-test runner có 19 assertion được khai báo; chưa thể chạy full trong Chromium ở môi trường này. Baseline 15/15 V39.0 được ghi trong QA_RESULTS; bốn assertion mới được kiểm tra logic riêng trong Node harness.

## Giới hạn còn lại

Đây vẫn là **Release Candidate**, chưa phải Gold Master đã chứng nhận. Chưa có full browser playthrough, đăng nhập/Supabase thật, triển khai Render thật, test mobile, kiểm tra đa thiết bị hoặc review pháp lý. Đổi tên hiển thị và tên nhân vật không xác lập quyền đối với sprite, ảnh, thiết kế, âm nhạc, SFX, font, câu chuyện hay mã nguồn có nguồn gốc bên thứ ba. Các asset keys nội bộ cũ còn tồn tại có chủ đích để tương thích; cần kiểm tra nguồn gốc/giấy phép của chính tài nguyên ảnh.

**Release decision:** phù hợp làm bản nộp nghiệm thu kỹ thuật/staging; chưa đủ căn cứ để tuyên bố platform approval, bản quyền sạch hoặc bảo mật độc lập.
