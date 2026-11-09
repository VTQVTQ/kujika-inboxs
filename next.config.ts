import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { BASE_PATH } from "./lib/base-path";

// Đọc cấu hình ngôn ngữ từ ./i18n/request.ts
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Tiền tố đường dẫn khi chạy sau IIS/reverse proxy chung domain với app khác (xem lib/base-path.ts)
  basePath: BASE_PATH,
  // Gói chạy production gọn (.next/standalone: chỉ phần node_modules thật sự dùng) — deploy/build-release.ps1 đóng gói từ đây
  output: "standalone",
  reactStrictMode: true,
  // Ẩn header "X-Powered-By: Next.js" (production chạy thẳng server.js do Next tự sinh, không qua Express)
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
