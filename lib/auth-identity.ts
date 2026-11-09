import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Xác định tài khoản đang truy cập. Dùng chung cho middleware.ts và lib/auth.ts
 * nên không import next/headers.
 *
 * Nguồn tài khoản:
 *  - iis  : mặc định khi NODE_ENV=production (và không bật ALLOW_USER_SWITCH / AUTH_TEST_LOGIN). IIS đứng trước (Windows Authentication,
 *           URL Rewrite/ARR) rồi chuyển request sang Node ở 127.0.0.1 kèm header x-remote-user = DOMAIN\account ({LOGON_USER}).
 *           Header được tin trực tiếp, KHÔNG có mã bí mật đi kèm (cùng cơ chế với hệ thống kho): an toàn chỉ dựa vào việc Node
 *           chỉ nghe loopback (127.0.0.1) nên không ai ngoài IIS trên cùng máy gọi tới được. Domain phải đúng AUTH_AD_DOMAIN.
 *  - test : AUTH_TEST_LOGIN=1 — môi trường test khi chưa có domain thật, mô phỏng SSO khi trình duyệt phải hỏi tài khoản:
 *           middleware trả 401 + WWW-Authenticate → trình duyệt hiện hộp thoại đăng nhập hệ thống; người dùng nhập tài khoản
 *           domain giả định (DOMAIN\account) + password dùng chung TEST_LOGIN_CODE; trình duyệt gửi lại header Authorization
 *           ở mọi request. Sau đó xử lý như iis. Chỉ do scripts/test-login.mjs đặt; KHÔNG đặt trong .env của máy chủ thật.
 *  - dev  : `npm run dev` hoặc ALLOW_USER_SWITCH=1 — đọc cookie của bộ chọn "Người dùng thử" ở sidebar.
 */
export const USER_COOKIE = "inbox_user";
const DEV_DEFAULT_ACCOUNT = process.env.DEV_ACCOUNT?.trim().toLowerCase() || "le.vanphuc";
/** Header do IIS đặt = {LOGON_USER} (DOMAIN\account); IIS ghi đè giá trị client tự gửi */
const REMOTE_USER_HEADER = "x-remote-user";

export type AuthProvider = "iis" | "test" | "dev";

export function getAuthProvider(): AuthProvider {
  if (process.env.AUTH_TEST_LOGIN === "1") return "test";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_USER_SWITCH === "1") return "dev";
  return "iis";
}

/** Header trình duyệt gửi lại sau khi người dùng nhập vào hộp thoại đăng nhập (HTTP Basic) */
export const AUTHORIZATION_HEADER = "authorization";
const BASIC_PREFIX = "basic ";
/** Độ dài tối đa của header Authorization được xử lý (chặn chuỗi rác quá dài) */
const AUTHORIZATION_MAX = 1024;

/** Thông tin header WWW-Authenticate để trình duyệt hiện hộp thoại đăng nhập hệ thống (chế độ test) */
export const TEST_AUTH_CHALLENGE = 'Basic realm="inbox", charset="UTF-8"';

/** So sánh password theo thời gian không đổi (băm trước để hai chuỗi cùng độ dài) */
function samePassword(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Chế độ test — bước xác thực (như Windows kiểm tra tài khoản domain): tên đăng nhập trong header Authorization (Basic)
 * nếu đúng dạng tài khoản domain AUTH_AD_DOMAIN (DOMAIN\account) VÀ password đúng TEST_LOGIN_CODE; ngược lại null
 * → middleware hỏi lại (hộp thoại hiện lại). Thiếu domain / sai domain bị từ chối ở đây như sai password, không vào được trang.
 * Hộp việc không có bảng người dùng: ai xác thực được chỉ thấy việc có assignee_account trùng tài khoản của mình.
 */
export function basicAuthAccount(header: string | null): string | null {
  const expected = process.env.TEST_LOGIN_CODE;
  const domain = process.env.AUTH_AD_DOMAIN;
  if (!expected || !domain || !header || header.length > AUTHORIZATION_MAX || !header.toLowerCase().startsWith(BASIC_PREFIX)) return null;
  const decoded = Buffer.from(header.slice(BASIC_PREFIX.length).trim(), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep <= 0) return null;
  const username = decoded.slice(0, sep).trim();
  // So password trước, luôn chạy dù tên sai → thời gian trả lời không lộ tên đăng nhập nào đúng định dạng
  const passwordOk = samePassword(decoded.slice(sep + 1), expected);
  return passwordOk && normalizeDomainAccount(username, domain) ? username : null;
}

/**
 * Tên đăng nhập người dùng đã gõ (KHÔNG kiểm tra password) — chỉ để ghi nhật ký lần đăng nhập sai.
 * null = request không gửi kèm thông tin đăng nhập.
 */
export function basicAuthAttempt(header: string | null): string | null {
  if (!header || header.length > AUTHORIZATION_MAX || !header.toLowerCase().startsWith(BASIC_PREFIX)) return null;
  const decoded = Buffer.from(header.slice(BASIC_PREFIX.length).trim(), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  return sep > 0 ? decoded.slice(0, sep).trim() : "";
}

/** "FIVESTAR\FS-Quoc-Trong" → "fs-quoc-trong". Sai domain hoặc sai định dạng → null */
export function normalizeDomainAccount(raw: string, domain: string): string | null {
  const parts = raw.trim().split("\\");
  if (parts.length !== 2) return null;
  const [userDomain, account] = parts;
  if (!account || userDomain.toLowerCase() !== domain.toLowerCase()) return null;
  return account.toLowerCase();
}

export type RequestIdentitySource = {
  header(name: string): string | null;
  cookie(name: string): string | undefined;
};

/**
 * Tài khoản Windows thô (DOMAIN\account): iis = header x-remote-user do IIS đặt; test = tên đăng nhập trong hộp thoại (password đúng).
 * null nếu chưa đăng nhập hoặc đang ở chế độ dev.
 */
export function windowsAccount(src: RequestIdentitySource): string | null {
  const provider = getAuthProvider();
  if (provider === "iis") return src.header(REMOTE_USER_HEADER);
  if (provider === "test") return basicAuthAccount(src.header(AUTHORIZATION_HEADER));
  return null;
}

/** Tài khoản (không kèm domain) của request; null nếu không xác định được */
export function resolveAccount(src: RequestIdentitySource): string | null {
  if (getAuthProvider() === "dev") return src.cookie(USER_COOKIE) || DEV_DEFAULT_ACCOUNT;

  // iis / test: cùng quy tắc domain như máy chủ thật
  const domain = process.env.AUTH_AD_DOMAIN;
  if (!domain) throw new Error("Chưa cấu hình AUTH_AD_DOMAIN (bắt buộc khi chạy sau IIS hoặc đăng nhập thử)");
  const raw = windowsAccount(src);
  return raw ? normalizeDomainAccount(raw, domain) : null;
}

/** Tài khoản để hiển thị: FIVESTAR\fs-quoc-trong khi chạy sau IIS / đăng nhập thử, ngược lại chỉ tên tài khoản */
export function displayAccount(account: string): string {
  const domain = process.env.AUTH_AD_DOMAIN;
  return getAuthProvider() !== "dev" && domain ? `${domain.toUpperCase()}\\${account}` : account;
}

