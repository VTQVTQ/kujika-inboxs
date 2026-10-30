import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Nhật ký hoạt động của API (append-only) ghi ra FILE, mỗi ngày một file: <AUDIT_LOG_DIR>/audit-YYYY-MM-DD.log
 * (mặc định thư mục "logs" cạnh ứng dụng), mỗi dòng một JSON (JSON Lines). Giờ theo UTC.
 * Không ghi: mã API / token, nội dung thân yêu cầu, địa chỉ IP. Ghi nhật ký KHÔNG BAO GIỜ ném lỗi (lỗi ghi file chỉ ra console).
 * Không tự xóa file cũ: dọn / lưu trữ theo quy định của công ty.
 */

export type AuditResult = "OK" | "DENIED" | "ERROR";

export interface AuditEntry {
  /** Mã thao tác, VD "source.replace" */
  action: string;
  result: AuditResult;
  /** Mã HTTP trả về */
  status: number;
  /** "admin", "system:<khóa>" hoặc "anonymous" (chưa xác thực được) */
  actor: string;
  method: string;
  path: string;
  /** Hệ thống / đề nghị / bước bị tác động (lấy từ đường dẫn) */
  system?: string;
  sourceId?: string;
  stepNo?: string;
  /** Mã lỗi của API khi không thành công */
  errorCode?: string;
  /** Thông tin thêm không nhạy cảm (số việc, changed, stale...) */
  detail?: Record<string, string | number | boolean>;
}

/** Ngữ cảnh của một yêu cầu: authenticate() ghi người gọi, route handler ghi detail */
export interface AuditContext {
  actor: string;
  detail: Record<string, string | number | boolean>;
}

const als = new AsyncLocalStorage<AuditContext>();

export const runWithAudit = <T>(fn: () => Promise<T>) => als.run({ actor: "anonymous", detail: {} }, fn);
export const auditContext = () => als.getStore();

/** Ghi người gọi đã xác thực vào ngữ cảnh của yêu cầu hiện tại */
export function auditActor(actor: string) {
  const ctx = als.getStore();
  if (ctx) ctx.actor = actor;
}

/** Thêm thông tin không nhạy cảm vào dòng nhật ký của yêu cầu hiện tại */
export function auditDetail(detail: AuditContext["detail"]) {
  const ctx = als.getStore();
  if (ctx) Object.assign(ctx.detail, detail);
}

let ensuredDir: string | null = null;

/** Thư mục nhật ký (tuyệt đối). Đổi bằng AUDIT_LOG_DIR */
const logDir = () => path.resolve(process.env.AUDIT_LOG_DIR?.trim() || "logs");

/** Ghi một dòng nhật ký. Không ném lỗi */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const now = new Date();
    const dir = logDir();
    if (ensuredDir !== dir) {
      await mkdir(dir, { recursive: true });
      ensuredDir = dir;
    }
    const line = JSON.stringify({ ts: now.toISOString(), ...entry }) + "\n";
    await appendFile(path.join(dir, `audit-${now.toISOString().slice(0, 10)}.log`), line, "utf8");
  } catch (e) {
    console.error("[audit] Không ghi được nhật ký hoạt động", e);
  }
}
