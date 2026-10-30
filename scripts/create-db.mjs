/**
 * Tạo DB và tài khoản PostgreSQL riêng cho Việc cần xử lý (chạy một lần khi cài mới, chạy lại an toàn: đã có thì bỏ qua,
 * không xóa / sửa gì của DB đã có). Cần tài khoản quản trị PostgreSQL (thường là "postgres") — chỉ dùng trong lúc chạy
 * script này, không được lưu ở đâu cả.
 *
 *   node scripts/create-db.mjs --admin-url postgresql://postgres:<mật khẩu>@localhost:5432/postgres --db inbox --user inbox --password <mật khẩu mới>
 * Hoặc đặt mật khẩu quản trị / mật khẩu mới ở biến môi trường PG_ADMIN_URL / INBOX_DB_PASSWORD (không lộ trên dòng lệnh).
 */
import pg from "pg";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const adminUrl = arg("admin-url") ?? process.env.PG_ADMIN_URL;
const db = arg("db") ?? "inbox";
const user = arg("user") ?? "inbox";
const password = arg("password") ?? process.env.INBOX_DB_PASSWORD;
const IDENT = /^[a-z][a-z0-9_]{0,62}$/;

if (!adminUrl || !password) {
  console.error("Thiếu --admin-url (hoặc PG_ADMIN_URL) hoặc --password (hoặc INBOX_DB_PASSWORD).");
  process.exit(1);
}
if (!IDENT.test(db) || !IDENT.test(user)) {
  console.error("Tên DB / tài khoản chỉ gồm chữ thường, số, dấu gạch dưới và bắt đầu bằng chữ cái.");
  process.exit(1);
}

const quote = (id) => `"${id.replace(/"/g, '""')}"`;
const admin = new pg.Client({ connectionString: adminUrl });
try {
  await admin.connect();
  const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [user]);
  if (role.rowCount) console.log(`Tài khoản ${user} đã có: giữ nguyên.`);
  else {
    // CREATE ROLE không nhận tham số → dùng literal đã thoát
    await admin.query(`CREATE ROLE ${quote(user)} LOGIN PASSWORD '${password.replace(/'/g, "''")}'`);
    console.log(`Đã tạo tài khoản ${user}.`);
  }
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
  if (exists.rowCount) console.log(`DB ${db} đã có: giữ nguyên.`);
  else {
    await admin.query(`CREATE DATABASE ${quote(db)} OWNER ${quote(user)} ENCODING 'UTF8'`);
    console.log(`Đã tạo DB ${db}.`);
  }
} catch (e) {
  console.error("Không tạo được DB:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await admin.end();
}
