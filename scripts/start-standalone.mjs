// `npm run start` cục bộ: chạy .next/standalone/server.js (server do Next tự sinh) sau `npm run build`.
// .next/standalone không có .env riêng (post-build.mjs xóa đi để bí mật máy build không lọt vào gói mang sang máy khác),
// trong khi server.js do Next tự sinh đổi cwd sang chính thư mục đó trước khi đọc .env.
// Copy tạm .env từ gốc dự án vào đó để chạy thử production build ngay trên máy dev — không ảnh hưởng bản deploy
// thật (deploy/install.ps1 tự đặt .env thật trực tiếp cạnh server.js trên máy chủ).
import { copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const server = path.join(root, ".next", "standalone", "server.js");
if (!existsSync(server)) {
  console.error("Chưa có .next/standalone/server.js: chạy `npm run build` trước `npm run start`.");
  process.exit(1);
}
const standaloneEnv = path.join(root, ".next", "standalone", ".env");
const rootEnv = path.join(root, ".env");
if (!existsSync(standaloneEnv) && existsSync(rootEnv)) {
  copyFileSync(rootEnv, standaloneEnv);
  console.log("Đã copy .env vào .next/standalone (chỉ máy dev — bản deploy thật tự đặt .env riêng cạnh server.js)");
}

const result = spawnSync(process.execPath, [server], { stdio: "inherit" });
process.exit(result.status ?? 1);
