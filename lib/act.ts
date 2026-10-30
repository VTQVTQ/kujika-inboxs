import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";

/**
 * Gọi API xử lý của hệ thống nguồn khi người dùng bấm Xác nhận / Phê duyệt / Trả lại trên hộp việc.
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

/** Gửi yêu cầu xử lý. Không theo chuyển hướng; chỉ dùng message ngắn đã kiểm tra của hệ thống nguồn, không chuyển tiếp nội dung khác */
export async function callSourceAct(system: { key: string; baseUrl: string; actionSecretVersion: number }, req: ActRequest): Promise<ActOutcome> {
  const body = JSON.stringify({ ...req, nonce: randomUUID() });
  const timestamp = String(Date.now());
  let res: Response;
  try {
    res = await fetch(system.baseUrl + ACT_PATH, {
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
    return { ok: false, status: 0, message: "unreachable" };
  }
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (res.ok && parsed.success && parsed.data.ok) return { ok: true, message: parsed.data.message ?? "", approved: parsed.data.approved === true };
  return { ok: false, status: res.status, message: parsed.success ? (parsed.data.message ?? "") : "" };
}
