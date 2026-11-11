import { getRequestConfig } from "next-intl/server";
import ja from "../messages/ja.json";
import { DEFAULT_LOCALE, TIME_ZONE } from "./config";

/** next-intl không dùng ngôn ngữ trên URL: chỉ có tiếng Nhật */
export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  timeZone: TIME_ZONE,
  messages: ja,
}));
