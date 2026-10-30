import { NextResponse, type NextRequest } from "next/server";
import { AUTHORIZATION_HEADER, basicAuthAccount, getAuthProvider, resolveAccount, TEST_AUTH_CHALLENGE } from "@/lib/auth-identity";

const DENIED_PATH = "/khong-co-quyen";
/** API công khai cho hệ thống nguồn: xác thực bằng mã API (Bearer) ở từng route handler, không dùng danh tính Windows */
const API_PATH = "/api/v1";

/** Chế độ test: nhập sai password → chờ một nhịp trước khi hỏi lại (dò password hàng loạt rất chậm) */
const FAILED_LOGIN_DELAY_MS = 1000;

/**
 * Trang: chỉ cho người xác định được tài khoản AD (SSO / IIS / đăng nhập thử / dev). Không có bảng người dùng:
 * ai đăng nhập được chỉ thấy việc có assignee_account trùng tài khoản của mình (lib/store.ts).
 * Chạy trên Node.js runtime (dùng node:crypto để so password theo thời gian không đổi).
 */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === API_PATH || path.startsWith(API_PATH + "/")) return NextResponse.next();

  if (getAuthProvider() === "test" && !basicAuthAccount(req.headers.get(AUTHORIZATION_HEADER))) {
    // Có gửi thông tin đăng nhập nhưng sai: làm chậm trước khi hỏi lại
    if (req.headers.get(AUTHORIZATION_HEADER)) await new Promise((s) => setTimeout(s, FAILED_LOGIN_DELAY_MS));
    return new NextResponse(null, { status: 401, headers: { "WWW-Authenticate": TEST_AUTH_CHALLENGE } });
  }

  const account = resolveAccount({ header: (name) => req.headers.get(name), cookie: (name) => req.cookies.get(name)?.value });
  if (!account) return NextResponse.rewrite(new URL(DENIED_PATH, req.url), { status: 403 });
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|khong-co-quyen).*)"],
};
