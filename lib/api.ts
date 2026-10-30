import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ApiError } from "@/lib/api-error";
import { auditActor, auditContext, recordAudit, runWithAudit } from "@/lib/audit";
import { SOURCE_ID_MAX, SYSTEM_KEY_PATTERN } from "@/lib/contract";
import { findSystemByToken } from "@/lib/systems";

/** Mã quản trị API tối thiểu 32 ký tự (đoán mò không khả thi) */
const ADMIN_TOKEN_MIN_LENGTH = 32;
/** Thân yêu cầu tối đa (byte): một đề nghị tối đa 50 việc, mỗi việc vài trăm byte */
const BODY_MAX_BYTES = 256 * 1024;
/** Giới hạn tần suất: số yêu cầu mỗi phút cho mỗi mã API */
const RATE_LIMIT_PER_MINUTE = 600;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_KEYS = 1000;

export type Caller = { kind: "admin" } | { kind: "system"; key: string };

const rate = new Map<string, { windowStart: number; count: number }>();

function checkRate(tokenHash: string) {
  const now = Date.now();
  if (rate.size >= RATE_MAX_KEYS) rate.clear();
  const slot = rate.get(tokenHash);
  if (!slot || now - slot.windowStart >= RATE_WINDOW_MS) {
    rate.set(tokenHash, { windowStart: now, count: 1 });
    return;
  }
  slot.count++;
  if (slot.count > RATE_LIMIT_PER_MINUTE) throw new ApiError(429, "rate_limited", "Quá nhiều yêu cầu, thử lại sau");
}

const digest = (s: string) => createHash("sha256").update(s).digest();

function isAdminToken(token: string) {
  const admin = process.env.INBOX_ADMIN_TOKEN;
  if (!admin || admin.length < ADMIN_TOKEN_MIN_LENGTH) return false;
  return timingSafeEqual(digest(token), digest(admin));
}

/**
 * Xác thực mã API ở header Authorization: Bearer <mã>.
 * Mã quản trị (INBOX_ADMIN_TOKEN) = admin; mã của một hệ thống đang hoạt động = system. Còn lại 401.
 */
export async function authenticate(req: NextRequest): Promise<Caller> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.length <= 300 && header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "unauthorized", "Thiếu hoặc sai mã API (Authorization: Bearer <mã>)");
  checkRate(digest(token).toString("hex"));

  if (isAdminToken(token)) {
    auditActor("admin");
    return { kind: "admin" };
  }
  const system = await findSystemByToken(token);
  if (!system) throw new ApiError(401, "unauthorized", "Thiếu hoặc sai mã API (Authorization: Bearer <mã>)");
  auditActor(`system:${system.key}`);
  if (!system.isActive) throw new ApiError(403, "system_inactive", "Hệ thống đang tạm ngưng");
  return { kind: "system", key: system.key };
}

export async function requireAdmin(req: NextRequest) {
  const caller = await authenticate(req);
  if (caller.kind !== "admin") throw new ApiError(403, "forbidden", "Chỉ mã quản trị được dùng chức năng này");
  return caller;
}

/** Quản trị hoặc chính hệ thống này; mã của hệ thống khác bị 403 (không ghi / đọc việc của hệ thống khác) */
export async function requireSystem(req: NextRequest, key: string) {
  if (!SYSTEM_KEY_PATTERN.test(key)) throw new ApiError(404, "system_not_found", "Hệ thống chưa được đăng ký");
  const caller = await authenticate(req);
  if (caller.kind === "system" && caller.key !== key) throw new ApiError(403, "forbidden", "Mã API không thuộc hệ thống này");
  return caller;
}

/** Mã đối tượng ở đường dẫn: 1–100 ký tự, không điều khiển */
export function parseSourceId(raw: string) {
  const id = raw.trim();
  if (!id || id.length > SOURCE_ID_MAX || /[\x00-\x1f\x7f]/.test(id)) throw new ApiError(400, "invalid_source_id", "sourceId không hợp lệ");
  return id;
}

export function parseStepNo(raw: string) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new ApiError(400, "invalid_step_no", "stepNo phải là số nguyên dương");
  return n;
}

/** Đọc thân JSON có giới hạn kích thước và kiểm tra bằng zod schema */
export async function readJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > BODY_MAX_BYTES) throw new ApiError(413, "body_too_large", "Nội dung gửi lên quá lớn");
  const text = await req.text();
  if (Buffer.byteLength(text) > BODY_MAX_BYTES) throw new ApiError(413, "body_too_large", "Nội dung gửi lên quá lớn");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Nội dung không phải JSON hợp lệ");
  }
  return schema.parse(json);
}

/** Tham số truy vấn (?a=b) thành object, bỏ khóa rỗng */
export function readQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.output<S> {
  const raw = Object.fromEntries([...req.nextUrl.searchParams.entries()].filter(([, v]) => v !== ""));
  return schema.parse(raw);
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Tham số đường dẫn (Next 15 truyền Promise); route không có tham số nhận object rỗng */
type RouteContext = { params: Promise<Record<string, string>> };
type NoParams = { params: Promise<Record<string, never>> };

/** Ghi một dòng nhật ký cho yêu cầu vừa xử lý xong (hệ thống / đề nghị / bước lấy từ tham số đường dẫn) */
async function writeAudit(action: string, req: NextRequest, ctx: RouteContext, status: number, errorCode?: string) {
  const store = auditContext();
  const params = await ctx.params.catch(() => undefined);
  await recordAudit({
    action,
    result: status < 400 ? "OK" : status === 401 || status === 403 ? "DENIED" : "ERROR",
    status,
    actor: store?.actor ?? "anonymous",
    method: req.method,
    path: req.nextUrl.pathname,
    system: params?.key,
    sourceId: params?.sourceId,
    stepNo: params?.stepNo,
    errorCode,
    detail: store && Object.keys(store.detail).length ? store.detail : undefined,
  });
}

/**
 * Bọc route handler: ApiError / lỗi zod → JSON { error: { code, message, fields? } }; lỗi khác → 500 chung chung (chi tiết chỉ ở log máy chủ).
 * action = mã thao tác ghi vào nhật ký hoạt động (lib/audit.ts): mỗi yêu cầu một dòng, kể cả bị từ chối / lỗi.
 */
export function route<C extends RouteContext = NoParams>(action: string, fn: (req: NextRequest, ctx: C) => Promise<NextResponse>) {
  return (req: NextRequest, ctx: C) =>
    runWithAudit(async () => {
      let res: NextResponse;
      let errorCode: string | undefined;
      try {
        res = await fn(req, ctx);
      } catch (e) {
        if (e instanceof ApiError) {
          errorCode = e.code;
          res = json({ error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) } }, e.status);
        } else if (e instanceof ZodError) {
          errorCode = "invalid_request";
          const fields = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
          res = json({ error: { code: errorCode, message: "Dữ liệu gửi lên không hợp lệ", fields } }, 400);
        } else {
          console.error("[api]", req.method, req.nextUrl.pathname, e);
          errorCode = "internal_error";
          res = json({ error: { code: errorCode, message: "Lỗi máy chủ" } }, 500);
        }
      }
      await writeAudit(action, req, ctx, res.status, errorCode);
      return res;
    });
}
