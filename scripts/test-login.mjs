// Chạy hệ thống Việc cần xử lý ở chế độ MÔ PHỎNG SSO (môi trường test, chưa có SSO domain thật): trình duyệt hiện hộp thoại
// đăng nhập hệ thống, mỗi người nhập tài khoản domain giả định (VD FIVESTAR\fs-quoc-trong) + password chung; quyền theo bảng users.
//
//   npm run dev:test      bản dev (next dev, sửa code tự cập nhật)
//   npm run start:test    bản build (chạy `npm run build` trước) — nhanh hơn cho nhiều người thử
//
// Cần trong .env: AUTH_AD_DOMAIN, TEST_LOGIN_CODE (password đưa cho người thử).
// Máy khác vào bằng http://<IP máy này>:<PORT> (mặc định 3000). Không dùng cho máy chủ thật (server.js / SSO):
// lib/auth-identity.ts từ chối nếu bật cùng SSO_ENABLED=1.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Cách dùng: node scripts/test-login.mjs dev|start");
  process.exit(1);
}

// .env (bỏ BOM đầu file nếu có) — biến đã đặt sẵn trong môi trường được ưu tiên
const envFile = path.join(ROOT, ".env");
const fileEnv = existsSync(envFile) ? dotenv.parse(readFileSync(envFile, "utf8").replace(/^﻿/, "")) : {};
const env = { ...fileEnv, ...process.env, AUTH_TEST_LOGIN: "1" };

const missing = ["AUTH_AD_DOMAIN", "TEST_LOGIN_CODE"].filter((k) => !env[k]);
if (missing.length) {
  console.error(`Thiếu cấu hình trong .env: ${missing.join(", ")}`);
  process.exit(1);
}
if (env.SSO_ENABLED === "1") {
  console.error("SSO_ENABLED=1 đang bật: không chạy mô phỏng SSO cùng SSO thật.");
  process.exit(1);
}
if (mode === "start" && !existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.error("Chưa có bản build: chạy `npm run build` trước `npm run start:test`.");
  process.exit(1);
}

const port = env.PORT || "3001";
const lan = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => `http://${i.address}:${port}`);
// Chỉ in ở cửa sổ chạy server (người thử không thấy): giao diện cố ý giống hệt SSO thật
console.log("⚠  CHẾ ĐỘ MÔ PHỎNG SSO — tài khoản giả định + password chung, KHÔNG dùng cho máy chủ thật.");
console.log(`   Domain: ${env.AUTH_AD_DOMAIN.toUpperCase()} · Máy khác vào: ${lan.join(" , ") || "(không tìm thấy IP mạng)"}`);

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, mode, "-H", "0.0.0.0", "-p", port], { cwd: ROOT, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
