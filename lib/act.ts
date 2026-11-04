import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";

/**
 * Gọi API xử lý của hệ thống nguồn khi người dùng bấm Xác nhận / Phê duyệt / Trả lại trên hộp việc,
 * hoặc Xem mẫu trước / Xuất mẫu đề nghị (action "template", chỉ đọc; hệ thống nguồn kiểm tra quyền xem đề nghị theo tài khoản).
 *
 * Danh tính: tài khoản domain của NGƯỜI ĐANG MỞ hộp việc (lấy từ SSO / IIS ở server, không nhận từ trình duyệt) được đưa vào
 * yêu cầu. Hệ thống nguồn KHÔNG tin hộp việc về quyền: nó tự tra tài khoản trong danh sách người dùng của mình và tự kiểm tra
 * người đó có đúng là người được giao ở bước hiện tại không. Chữ ký HMAC chỉ chứng minh yêu cầu do hộp việc gửi, không bị sửa và còn mới.
 *
 * Địa chỉ cố định: POST {baseUrl}/api/inbox/act. Đặc tả đầy đủ: docs/api.md mục 7.
 */

const ACT_PATH = "/api/inbox/act";
const TIMEOUT_MS = 20_000;
/** Độ dài tối thiểu của INBOX_SIGNING_KEY (đoán mò không khả thi) */
const SIGNING_KEY_MIN_LENGTH = 32;
export const SIGNATURE_HEADER = "x-inbox-signature";
export const TIMESTAMP_HEADER = "x-inbox-timestamp";

export type ActAction = "approve" | "return";

/**
 * Bí mật ký của một hệ thống = HMAC-SHA256(INBOX_SIGNING_KEY, "act:<khóa>:<phiên bản>"), dạng base64url.
 * Suy ra khi cần nên không lưu bí mật trong DB; quản trị lấy giá trị này (API quản trị) để đặt ở hệ thống nguồn.
 */
export function deriveActionSecret(system: string, version: number) {
  const key = process.env.INBOX_SIGNING_KEY;
  if (!key || key.length < SIGNING_KEY_MIN_LENGTH) throw new Error(`Cần INBOX_SIGNING_KEY dài ít nhất ${SIGNING_KEY_MIN_LENGTH} ký tự`);
  return createHmac("sha256", key).update(`act:${system}:${version}`).digest("base64url");
}

/** Chữ ký hex của `${timestamp}.${body}` (hệ thống nguồn tính lại bằng cùng bí mật để kiểm tra) */
export const sign = (secret: string, timestamp: string, body: string) => createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

export interface ActRequest {
  sourceId: string;
  stepNo: number;
  action: ActAction;
  comment: string;
  /** Tài khoản domain (không kèm domain, chữ thường) của người bấm */
  account: string;
}

const responseSchema = z.object({
  ok: z.boolean(),
  message: z.string().max(500).optional(),
  approved: z.boolean().optional(),
});

export type ActOutcome = { ok: true; message: string; approved: boolean } | { ok: false; status: number; message: string };

type SourceSystem = { key: string; baseUrl: string; actionSecretVersion: number };

/** POST đã ký (kèm nonce) tới API xử lý của hệ thống nguồn. Không theo chuyển hướng. null = không kết nối được / quá thời gian chờ */
async function postSigned(system: SourceSystem, payload: Record<string, unknown>): Promise<Response | null> {
  const body = JSON.stringify({ ...payload, nonce: randomUUID() });
  const timestamp = String(Date.now());
  try {
    return await fetch(system.baseUrl + ACT_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TIMESTAMP_HEADER]: timestamp,
        [SIGNATURE_HEADER]: sign(deriveActionSecret(system.key, system.actionSecretVersion), timestamp, body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`[act] Không gọi được hệ thống ${system.key}`, e instanceof Error ? e.name : e);
    return null;
  }
}

/** Gửi yêu cầu xử lý. Chỉ dùng message ngắn đã kiểm tra của hệ thống nguồn, không chuyển tiếp nội dung khác */
export async function callSourceAct(system: SourceSystem, req: ActRequest): Promise<ActOutcome> {
  const res = await postSigned(system, { ...req });
  if (!res) return { ok: false, status: 0, message: "unreachable" };
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (res.ok && parsed.success && parsed.data.ok) return { ok: true, message: parsed.data.message ?? "", approved: parsed.data.approved === true };
  return { ok: false, status: res.status, message: parsed.success ? (parsed.data.message ?? "") : "" };
}

/* ------------------------------------------------------------------ */
/* Xuất mẫu đề nghị (chỉ đọc) — cùng API đã ký, action "template"      */
/* ------------------------------------------------------------------ */

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Tên file hệ thống nguồn đặt (header Content-Disposition) — chỉ chuyển tiếp khi đúng dạng tệp đính kèm .xlsx */
const DISPOSITION_PATTERN = /^attachment; filename="[\x20-\x7e]{1,200}\.xlsx"(; filename\*=UTF-8''[A-Za-z0-9%._~-]{1,600})?$/;

const previewSchema = z.object({
  ok: z.literal(true),
  /** HTML bảng tính do hệ thống nguồn dựng; hiển thị trong iframe sandbox (không chạy script) */
  html: z.string().max(2_000_000),
  fileName: z.string().min(1).max(200),
});

type Failure = { ok: false; status: number; message: string };
export type TemplatePreview = { ok: true; html: string; fileName: string } | Failure;
export type TemplateFile = { ok: true; body: ArrayBuffer; disposition: string } | Failure;

async function failure(res: Response | null): Promise<Failure> {
  if (!res) return { ok: false, status: 0, message: "unreachable" };
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  return { ok: false, status: res.status, message: parsed.success ? (parsed.data.message ?? "") : "" };
}

/** HTML xem trước mẫu đề nghị (hệ thống nguồn kiểm tra quyền xem theo tài khoản) */
export async function fetchSourceTemplatePreview(system: SourceSystem, req: { sourceId: string; account: string }): Promise<TemplatePreview> {
  const res = await postSigned(system, { ...req, action: "template", format: "preview" });
  if (!res?.ok) return failure(res);
  const parsed = previewSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : { ok: false, status: 502, message: "" };
}

/** File Excel mẫu đề nghị. Chỉ nhận đúng loại .xlsx + tên file đúng dạng, không chuyển tiếp header khác */
export async function fetchSourceTemplateFile(system: SourceSystem, req: { sourceId: string; account: string }): Promise<TemplateFile> {
  const res = await postSigned(system, { ...req, action: "template", format: "xlsx" });
  if (!res?.ok) return failure(res);
  const disposition = res.headers.get("content-disposition") ?? "";
  if (res.headers.get("content-type") !== XLSX || !DISPOSITION_PATTERN.test(disposition)) return { ok: false, status: 502, message: "" };
  return { ok: true, body: await res.arrayBuffer(), disposition };
}
