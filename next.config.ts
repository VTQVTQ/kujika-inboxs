import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Đọc cấu hình ngôn ngữ từ ./i18n/request.ts
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
