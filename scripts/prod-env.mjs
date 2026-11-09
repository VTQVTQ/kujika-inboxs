// Nạp .env cho các script vận hành chạy trên máy chủ (không có tsx / gói dev): bỏ BOM đầu file, biến đã đặt sẵn trong môi trường được ưu tiên
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const file = path.join(ROOT, ".env");
  const fromFile = existsSync(file) ? dotenv.parse(readFileSync(file, "utf8").replace(/^﻿/, "")) : {};
  for (const [k, v] of Object.entries(fromFile)) if (process.env[k] === undefined) process.env[k] = v;
  return process.env;
}

/** Che mật khẩu trong chuỗi kết nối khi in ra màn hình / nhật ký */
export function maskUrl(url) {
  return String(url).replace(/(:\/\/[^:/@]+:)[^@]*@/, "$1***@");
}
