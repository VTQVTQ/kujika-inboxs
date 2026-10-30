import type messages from "../messages/vi.json";
import type { Locale } from "./config";

// Key dịch được kiểm tra bằng TypeScript: gõ sai key → lỗi khi typecheck.
// messages/vi.json là bản gốc; messages/ja.json phải có đủ các key giống hệt.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
