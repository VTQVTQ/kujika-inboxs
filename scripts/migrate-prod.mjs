/**
 * Áp dụng migration lên DB trên máy chủ production — thay cho `npm run db:migrate` (cần drizzle-kit, gói dev, không có trên máy chủ
 * cài không kèm gói dev / không có internet). Dùng chính migrator của drizzle-orm và cùng bảng drizzle.__drizzle_migrations
 * nên kết quả giống hệt `db:migrate`. Chạy lại an toàn: chỉ áp dụng các migration chưa chạy. Không bao giờ xóa dữ liệu.
 *
 * Dùng: node scripts/migrate-prod.mjs
 * Cần: DATABASE_URL trong .env (hoặc biến môi trường)
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { loadEnv, maskUrl, ROOT } from "./prod-env.mjs";

const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error("Thiếu DATABASE_URL trong .env");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });

async function appliedCount() {
  const { rows } = await pool.query(`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok`);
  if (!rows[0].ok) return 0;
  return Number((await pool.query(`SELECT count(*) AS n FROM drizzle.__drizzle_migrations`)).rows[0].n);
}

try {
  console.log(`Kết nối ${maskUrl(env.DATABASE_URL)} ...`);
  await pool.query("SELECT 1");
  const before = await appliedCount();
  await migrate(drizzle(pool), { migrationsFolder: path.join(ROOT, "db", "migrations") });
  const after = await appliedCount();
  console.log(after > before ? `Đã áp dụng ${after - before} migration mới (tổng ${after}).` : `DB đã ở phiên bản mới nhất (${after} migration).`);
} catch (e) {
  console.error("Migration thất bại:", e instanceof Error ? e.message : e);
  console.error("Kiểm tra: DATABASE_URL đúng, PostgreSQL đang chạy, tài khoản trong DATABASE_URL có quyền tạo bảng trong DB này.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
