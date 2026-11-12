# V39.0.1 RC — Release gate checklist

## Engineering changes included
- [x] Kế thừa V37.3.4, giữ logic chiến đấu, tiến trình và các khóa lưu nội bộ cũ.
- [x] Lớp thương hiệu hiển thị CHRONO TOWER: GEM OF AETHER; thay đổi nhãn UI liên quan, giữ ID nội bộ để tương thích save.
- [x] Progressive unlock: SWITCH tầng 2; Forge/Tab/kỹ năng nâng cao tầng 3; Basement/Part Break tầng 5; Guild tầng 10. Có khóa tại hàm thao tác, không chỉ ẩn nút.
- [x] Tutorial tầng 1, thông báo mở khóa, hướng dẫn SWITCH sau lần bị khựng đầu tiên và lưu trạng thái đóng hướng dẫn trong profile extension.
- [x] Sửa mismatch `floor_11_20`; gió đổi hướng theo chu kỳ 9 giây.
- [x] Sàn dung nham tầng 21–30: cảnh báo trực quan, đứng yên 3 giây mới bắt đầu chịu sát thương định kỳ, sát thương không thể hạ HP dưới 1.
- [x] Khiên nguyên tố Boss các tầng Boss trong dải 31–40; đúng hệ mới gây sát thương lên khiên; đòn phá khiên không đồng thời trừ HP Boss.
- [x] Cloud Save đi qua Render API, Supabase token verification, sanitizer/whitelist, giới hạn payload và revision CAS.
- [x] Supabase schema giới hạn quyền ghi bảng profile/receipt cho service role.
- [x] Raid chỉ khởi chạy khi database được cấu hình; server lưu biên nhận trước khi phát thưởng; xác nhận loot cập nhật receipt trước khi xóa pending loot.
- [x] Sửa route fallback không được đứng trước HTTP API; sửa xử lý ACK của `v37:player_attack`.
- [x] Sửa seed account key/username thành `Kaelen_Chrono` thống nhất; ngăn lần save đầu tạo key song song.
- [x] Đổi nhãn roster hiển thị còn sót: Agil/Sinon thành Valerius/Sylvia; Alice/Klein thành Aurelia/Darian; giữ ID và asset keys nội bộ.
- [x] Chặn Stagger/Break do vũ khí sai hệ khi khiên nguyên tố đang hoạt động; giữ ngoại lệ cho Parry phòng thủ.
- [x] Mở rộng browser self-test runner lên 19 assertion; chạy riêng harness Stagger mới 6/6 PASS.

## Automated checks run in this environment
- [x] HTML parse: 34 script tags; 32 inline scripts checked.
- [x] `node --check` cho tất cả inline scripts: pass.
- [x] Không có DOM ID trùng lặp trong HTML.
- [x] `node --check server.js`: pass.
- [x] V39.0 baseline helper self-test: 15/15 đã chạy ở lượt trước.
- [x] V39.0.1 Stagger guard Node harness: 6/6 pass.
- [ ] Chạy full browser self-test runner (19 assertion) trong Chromium thật.
- [x] Runtime wrapper checks trong VM: khóa/mở SWITCH, Guild, Forge, Tab và Tầng Hầm; kỹ năng cơ bản/ nâng cao; khiên Boss tầng 33: pass.
- [x] Profile sanitizer harness: giới hạn level, Col, item, tầng liên tục, payload 90 KB, trường kho đồ allow-list và lọc prototype key: pass.

## Must be completed before public submission
- [ ] Apply migration to the actual Supabase project and verify grants/RLS/RPC.
- [ ] Deploy on Render with real environment variables and verify `/healthz` returns Auth/Cloud configured.
- [ ] Complete real sign-up/login, legacy profile import, Cloud Save/Restore, concurrent revision conflict, invalid-token and malformed-payload tests.
- [ ] Complete a full interactive playthrough on a real browser from floor 1 through at least floor 40. Browser automation was blocked in this build environment, so gameplay runtime is not certified here.
- [ ] Test each unlock and every active UI path using actual keyboard, mouse and mobile touch input.
- [ ] Test FIRE/ICE/THUNDER shield with matching and mismatched weapons on Boss floors 33/36/39.
- [ ] Test Raid completion, receipt persistence, receipt acknowledgement, DB failure reward withholding, reconnect and Render restart.
- [ ] Decide whether Party/Raid state is upgraded to persistent state before allowing multiple Render instances.
- [ ] Verify game art, character silhouettes, Boss designs, music, SFX, fonts, story and third-party licenses; obtain legal review of final name/mark.
- [ ] Finish privacy policy, terms, support contact, data deletion, retention policy and age/content rating.
- [ ] Build and test portal-specific SDK adapters and complete each platform's review requirements.

## Release decision

**Status: Release Candidate — not certified for public launch yet.** Syntax, static structure, helper logic and extracted server sanitizer tests passed. Real Supabase/Render integration, browser gameplay, mobile compatibility, external IP rights and platform acceptance remain unverified.
