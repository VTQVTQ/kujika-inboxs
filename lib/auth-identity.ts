import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Xác định tài khoản đang truy cập. Dùng chung cho middleware.ts và lib/auth.ts
 * nên không import next/headers.
 *
 * Nguồn tài khoản:
 *  - sso  : chạy bằng server.js (SSO_ENABLED=1). server.js xác thực Windows rồi đặt header x-windows-user
 *           = DOMAIN\account (header do client gửi bị xóa trước). Domain phải đúng AUTH_AD_DOMAIN.
 *  - iis  : SSO_PROXY=1 — IIS đứng trước (Windows Authentication) rồi chuyển request sang server.js (SSO_MODE=iis, nghe ở 127.0.0.1).
 *           IIS đặt header x-windows-user = DOMAIN\account và x-inbox-proxy-secret = SSO_PROXY_SECRET (mã bí mật dùng chung).
 *           Chỉ tin x-windows-user khi mã bí mật khớp (so sánh thời gian không đổi); sai / thiếu mã = chưa đăng nhập.
 *           Phần còn lại giống sso (domain phải đúng AUTH_AD_DOMAIN).
 *  - test : AUTH_TEST_LOGIN=1 — môi trường test khi chưa có domain thật, mô phỏng SSO khi trình duyệt phải hỏi tài khoản:
 *           middleware trả 401 + WWW-Authenticate → trình duyệt hiện hộp thoại đăng nhập hệ thống; người dùng nhập tài khoản
 *           domain giả định (DOMAIN\account) + password dùng chung TEST_LOGIN_CODE; trình duyệt gửi lại header Authorization
 *           ở mọi request. Sau đó xử lý y như SSO. Không được bật cùng SSO thật.
 *  - dev  : `npm run dev` hoặc ALLOW_USER_SWITCH=1 — đọc cookie của bộ chọn "Người dùng thử" ở sidebar.
 *  - none : còn lại (VD `next start` không qua server.js ở production) → từ chối mọi request.
 */
export const USER_COOKIE = "inbox_user";
const DEV_DEFAULT_ACCOUNT = process.env.DEV_ACCOUNT?.trim().toLowerCase() || "le.vanphuc";
const WINDOWS_USER_HEADER = "x-windows-user";
/** Header IIS gắn kèm để chứng minh x-windows-user do chính IIS đặt (giá trị = SSO_PROXY_SECRET) */
export const PROXY_SECRET_HEADER = "x-inbox-proxy-secret";
/** Độ dài tối thiểu của SSO_PROXY_SECRET (đoán mò không khả thi) */
export const PROXY_SECRET_MIN_LENGTH = 32;
/** Độ dài tối đa của header mã bí mật được xử lý (chặn chuỗi rác quá dài) */
const PROXY_SECRET_HEADER_MAX = 256;

export type AuthProvider = "sso" | "iis" | "test" | "dev" | "none";

export function getAuthProvider(): AuthProvider {
  const sso = process.env.SSO_ENABLED === "1";
  const iis = process.env.SSO_PROXY === "1";
  const test = process.env.AUTH_TEST_LOGIN === "1";
  // Đăng nhập giả định cùng máy chủ SSO thật = cửa sau giả danh → dừng hẳn thay vì chọn một bên
  if (test && (sso || iis)) throw new Error("AUTH_TEST_LOGIN=1 không được bật cùng SSO thật (server.js: SSPI hoặc IIS). Bỏ AUTH_TEST_LOGIN khỏi môi trường.");
  if (sso && iis) throw new Error("SSO_ENABLED=1 (SSPI) và SSO_PROXY=1 (IIS) không được bật cùng lúc. Chọn một chế độ bằng SSO_MODE trong .env.");
  if (sso) return "sso";
  if (iis) return "iis";
  if (test) return "test";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_USER_SWITCH === "1") return "dev";
  return "none";
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
 * Tài khoản Windows do IIS xác thực: chỉ tin header x-windows-user khi header x-inbox-proxy-secret khớp SSO_PROXY_SECRET.
 * Cấu hình thiếu / quá ngắn = lỗi (không bao giờ tin header khi chưa có mã bí mật đủ mạnh).
 */
function iisAccount(src: RequestIdentitySource): string | null {
  const secret = process.env.SSO_PROXY_SECRET;
  if (!secret || secret.length < PROXY_SECRET_MIN_LENGTH) {
    throw new Error(`SSO_PROXY=1 cần SSO_PROXY_SECRET dài ít nhất ${PROXY_SECRET_MIN_LENGTH} ký tự (mã bí mật dùng chung với IIS)`);
  }
  const given = src.header(PROXY_SECRET_HEADER);
  if (!given || given.length > PROXY_SECRET_HEADER_MAX || !samePassword(given, secret)) return null;
  return src.header(WINDOWS_USER_HEADER);
}

/**
 * Tài khoản Windows thô (DOMAIN\account): SSO = header do server.js gửi; iis = header do IIS gửi kèm mã bí mật;
 * test = tên đăng nhập trong hộp thoại (password đúng). null nếu không chạy SSO / IIS / test hoặc chưa đăng nhập.
 */
export function windowsAccount(src: RequestIdentitySource): string | null {
  const provider = getAuthProvider();
  if (provider === "sso") return src.header(WINDOWS_USER_HEADER);
  if (provider === "iis") return iisAccount(src);
  if (provider === "test") return basicAuthAccount(src.header(AUTHORIZATION_HEADER));
  return null;
}

/** Tài khoản (không kèm domain) của request; null nếu không xác định được */
export function resolveAccount(src: RequestIdentitySource): string | null {
  const provider = getAuthProvider();
  if (provider === "dev") return src.cookie(USER_COOKIE) || DEV_DEFAULT_ACCOUNT;
  if (provider === "none") return null;

  // sso / iis / test: cùng quy tắc domain như máy chủ thật
  const domain = process.env.AUTH_AD_DOMAIN;
  if (!domain) throw new Error("Chưa cấu hình AUTH_AD_DOMAIN (bắt buộc khi chạy SSO bằng server.js (SSPI / IIS) hoặc đăng nhập thử)");
  const raw = windowsAccount(src);
  return raw ? normalizeDomainAccount(raw, domain) : null;
}

/** Tài khoản để hiển thị: FIVESTAR\fs-quoc-trong khi chạy SSO (SSPI / IIS) / đăng nhập thử, ngược lại chỉ tên tài khoản */
export function displayAccount(account: string): string {
  const domain = process.env.AUTH_AD_DOMAIN;
  const provider = getAuthProvider();
  return (provider === "sso" || provider === "iis" || provider === "test") && domain ? `${domain.toUpperCase()}\\${account}` : account;
}

