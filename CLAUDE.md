# CLAUDE.md

Quy ước cho project hộp việc "Việc cần xử lý" (kujika-inboxs). Xem `README.md` cho cấu trúc, cách chạy và vận hành; `docs/api.md` cho API.

## UI/UX — kích thước và căn chỉnh nút (quy ước chung với project kho `kujiraa`)

- Các nút có liên quan về vị trí (cùng hàng / cột / nhóm, ví dụ chân hộp thoại, thanh thao tác, ô thao tác trong bảng) hoặc về chức năng (ví dụ Đóng / Xuất mẫu, Trả lại / Xác nhận) phải rộng bằng nhau.
- Khi chỉnh kích thước, ưu tiên sự thẳng hàng: chỉnh độ rộng nút sao cho các thành phần giao diện thẳng hàng theo chiều dọc hoặc chiều ngang (chung mép trái / phải, cột khớp với hàng trên / dưới). Yêu cầu có tỷ lệ (ví dụ nút này = ½ nút kia, hoặc hai nút + khoảng cách = một nút rộng) thì làm chính xác và đo trên trình duyệt, không ước lượng bằng mắt.
- Ưu tiên CSS (lưới `inline-grid` co theo nội dung với các cột `fr` bằng nhau, cột trải nhiều ô) để độ rộng theo nhãn dài nhất ở mọi ngôn ngữ; chỉ đo bằng JS khi CSS không diễn tả được. Chữ trong nút không được tràn, xuống dòng hay bị cắt (kiểm tra cả vi và ja).
- Mỗi lần chỉnh giao diện phải cập nhật luôn khung xương loading tương ứng (`loading.tsx`, `PagerSkeleton`, trạng thái đang tải trong hộp thoại…) để mỗi thành phần có cùng chiều cao ở trạng thái loading và trạng thái hiển thị — không bị nhảy bố cục khi dữ liệu về. Kiểm tra bằng cách đo cả hai trạng thái.
