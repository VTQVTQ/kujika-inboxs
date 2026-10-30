import "server-only";
import { cookies, headers } from "next/headers";
import { displayAccount, resolveAccount } from "@/lib/auth-identity";

/** Người đang truy cập: chỉ có tài khoản AD (hộp việc không có bảng người dùng) */
export interface CurrentUser {
  account: string;
  display: string;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

/** Tài khoản của request hiện tại; ném UnauthorizedError nếu không xác định được (middleware đã chặn trước, đây là lớp kiểm tra lại) */
export async function getCurrentUser(): Promise<CurrentUser> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  const account = resolveAccount({ header: (name) => h.get(name), cookie: (name) => c.get(name)?.value });
  if (!account) throw new UnauthorizedError();
  return { account, display: displayAccount(account) };
}
