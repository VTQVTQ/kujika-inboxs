-- Mô tả bảng / cột (sinh từ chú thích trong db/schema.ts)
COMMENT ON TABLE "inbox_systems" IS 'Hệ thống nguồn đã đăng ký (kho, ...). Chỉ hệ thống có mã (token) riêng mới ghi được việc của chính nó. Đăng ký / sửa qua API quản trị /api/v1/systems; không lưu token, chỉ lưu bản băm.';
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."key" IS 'Khóa hệ thống (chữ thường, số, gạch dưới / gạch ngang). VD: kho';
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."name_vi" IS 'Tên hiển thị tiếng Việt';
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."name_ja" IS 'Tên hiển thị tiếng Nhật';
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."base_url" IS 'Địa chỉ gốc (không có "/" cuối) của hệ thống, ghép với deep_link để mở việc ở tab mới. VD: http://kho.fivestar.local:3000';
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."token_hash" IS 'SHA-256 (hex) của mã API của hệ thống; mã gốc chỉ hiện một lần khi tạo / đổi';
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."is_active" IS 'false = hệ thống tạm ngưng: không nhận dữ liệu mới và không hiện việc trên trang';
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."created_at" IS 'Lúc đăng ký';
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."updated_at" IS 'Lúc sửa gần nhất';
--> statement-breakpoint
COMMENT ON TABLE "approval_inbox" IS 'Hộp việc cần xử lý: mỗi dòng là một bước duyệt gán cho một người, do hệ thống nguồn gửi sang. Chỉ là bản sao tóm tắt để hiển thị và chuyển sang hệ thống gốc xử lý; dữ liệu nghiệp vụ và việc duyệt vẫn ở hệ thống gốc. Ghi qua lib/store.ts (API /api/v1), không ghi tay.';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."id" IS 'Mã tự tăng';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."source_system" IS 'Hệ thống nguồn (inbox_systems.key)';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."source_type" IS 'Loại đối tượng ở hệ thống nguồn. VD: IN, OUT, SUPPLY';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."source_id" IS 'Mã đối tượng (đề nghị) ở hệ thống nguồn';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."step_no" IS 'Thứ tự bước duyệt trong đề nghị, bắt đầu từ 1';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."role" IS 'Vai trò của bước: CONFIRM / DECIDE';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."assignee_account" IS 'Tài khoản AD người được giao, viết thường (không kèm domain)';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."status" IS 'Trạng thái việc';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."code" IS 'Số chứng từ để hiển thị. VD: ĐN-XĐ-202610-002';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."title" IS 'Tiêu đề / nội dung ngắn để hiển thị';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."requester_name" IS 'Tên người đề nghị (chỉ để hiển thị)';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."priority" IS 'Mức độ ưu tiên: LOW / MEDIUM / HIGH';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."deep_link" IS 'Đường dẫn tương đối tới màn xử lý ở hệ thống nguồn (ghép với base_url của hệ thống). VD: /de-nghi/12';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."summary" IS 'Tóm tắt ngắn (số dòng, tổng số lượng...)';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."submitted_at" IS 'Lúc đề nghị được gửi';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."acted_at" IS 'Lúc bước này được xử lý';
--> statement-breakpoint
COMMENT ON COLUMN "approval_inbox"."source_version" IS 'Mốc thời gian của lần đồng bộ đã ghi dòng này; bản đồng bộ cũ hơn bị bỏ qua';
