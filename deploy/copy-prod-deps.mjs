// Chép các gói npm (kèm phụ thuộc production) từ node_modules của dự án vào node_modules của bản phát hành.
// Dùng bởi deploy/build-release.ps1: bản Next.js standalone chỉ mang gói mà ứng dụng Next dùng, còn scripts/*.mjs
// (cài đặt trên máy chủ, chạy trực tiếp bằng node, ngoài đồ thị build của Next) cần thêm drizzle-orm, pg, dotenv.
// Chạy: node deploy/copy-prod-deps.mjs <thư mục dự án> <thư mục bản phát hành> <gói> [<gói> ...]
import fs from "node:fs";
import path from "node:path";

const [root, dest, ...roots] = process.argv.slice(2);
if (!root || !dest || roots.length === 0) {
  console.error("Dùng: node deploy/copy-prod-deps.mjs <thư mục dự án> <thư mục bản phát hành> <gói> [<gói> ...]");
  process.exit(1);
}

const seen = new Set();

/** Thư mục gói theo cách Node tìm: node_modules lồng gần nhất trước, rồi node_modules gốc */
function findPackage(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.dirname(dir) === dir) break;
  }
  return null;
}

function copyPackage(name, from) {
  const src = findPackage(name, from);
  if (!src) throw new Error(`Không thấy gói "${name}" trong node_modules (đã chạy npm ci chưa?)`);
  const rel = path.relative(path.join(root, "node_modules"), src);
  if (seen.has(rel)) return;
  seen.add(rel);
  const target = path.join(dest, "node_modules", rel);
  if (!fs.existsSync(target)) fs.cpSync(src, target, { recursive: true });
  const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"));
  for (const dep of Object.keys(dependencies)) copyPackage(dep, src);
}

for (const name of roots) copyPackage(name, root);
console.log(`Đã bảo đảm ${seen.size} gói trong ${path.join(dest, "node_modules")}`);
