// Chạy tự động sau `npm run build` (npm "postbuild"): Next.js sao chép .env* của máy build vào .next/standalone,
// trong khi thư mục này được đóng gói mang sang máy khác → xóa để bí mật (DATABASE_URL, INBOX_ADMIN_TOKEN…) không đi theo.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, ".next", "standalone");
if (existsSync(dir)) {
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(".env")) continue;
    rmSync(path.join(dir, name), { force: true });
    console.log(`Đã xóa ${path.join(".next", "standalone", name)} (không để bí mật đi theo gói phát hành)`);
  }
}

// .next/standalone/server.js (do Next.js tự sinh) là server chạy production thật.
// Vá 2 giá trị mặc định ngay trong file sinh ra (an toàn kể cả khi ai đó quên đặt biến môi trường PORT/HOSTNAME
// lúc đăng ký dịch vụ — đúng kiểu lỗi từng khiến server bind nhầm 0.0.0.0 thay vì loopback):
//   - cổng mặc định của Next là 3000, đổi thành 3001 (cổng của hộp việc; kho dùng 9006).
//   - HOSTNAME mặc định của Next là "0.0.0.0" (mọi network interface) — ứng dụng tin thẳng header x-remote-user
//     từ IIS không kèm mã bí mật (xem lib/auth-identity.ts), an toàn hoàn toàn dựa vào việc Node chỉ nghe loopback.
//     Đổi mặc định thành 127.0.0.1 để lỡ quên đặt HOSTNAME vẫn an toàn, thay vì vô tình mở ra cả mạng.
const standaloneServer = path.join(dir, "server.js");
if (existsSync(standaloneServer)) {
  let content = readFileSync(standaloneServer, "utf8");
  const original = content;
  content = content.replace(
    "const currentPort = parseInt(process.env.PORT, 10) || 3000",
    "const currentPort = parseInt(process.env.PORT, 10) || 3001",
  );
  content = content.replace("const hostname = process.env.HOSTNAME || '0.0.0.0'", "const hostname = process.env.HOSTNAME || '127.0.0.1'");
  if (content === original) {
    console.error("Không vá được cổng / hostname mặc định trong .next/standalone/server.js: định dạng file do Next sinh ra đã đổi, cần cập nhật scripts/post-build.mjs.");
    process.exit(1);
  }
  writeFileSync(standaloneServer, content);
  console.log(`Đã đổi mặc định trong ${path.join(".next", "standalone", "server.js")}: cổng 3001, hostname 127.0.0.1`);
}

// Next.js KHÔNG tự copy public/ và .next/static vào .next/standalone (yêu cầu bắt buộc theo tài liệu Next) —
// thiếu thì server chạy được nhưng ảnh/CSS/JS client đều 404. Copy ở đây để .next/standalone tự đứng độc lập.
if (existsSync(dir)) {
  for (const [src, dst, label] of [
    [path.join(root, "public"), path.join(dir, "public"), "public/"],
    [path.join(root, ".next", "static"), path.join(dir, ".next", "static"), ".next/static/"],
  ]) {
    if (!existsSync(src)) continue;
    cpSync(src, dst, { recursive: true });
    console.log(`Đã copy ${label} vào .next/standalone`);
  }
}
