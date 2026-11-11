import type messages from "../messages/ja.json";
import type { Locale } from "./config";

// Key dịch được kiểm tra bằng TypeScript: gõ sai key → lỗi khi typecheck.
// messages/ja.json là bản gốc (và duy nhất).
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
