ALTER TABLE "inbox_systems" ADD COLUMN "inline_act" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_systems" ADD COLUMN "action_secret_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."inline_act" IS 'true = cho xử lý (xác nhận / phê duyệt / trả lại) ngay trên hộp việc bằng cách gọi API của hệ thống nguồn; false = chỉ xem và mở hệ thống gốc';--> statement-breakpoint
COMMENT ON COLUMN "inbox_systems"."action_secret_version" IS 'Phiên bản bí mật ký lời gọi xử lý: bí mật suy ra từ INBOX_SIGNING_KEY + khóa hệ thống + phiên bản; tăng số này để đổi bí mật (bí mật cũ hết hiệu lực)';
