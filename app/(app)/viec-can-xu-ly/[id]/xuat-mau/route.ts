import { getTranslations } from "next-intl/server";
import { fetchSourceTemplateFile } from "@/lib/act";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser, UnauthorizedError } from "@/lib/auth";
import { findExportableItem } from "@/lib/store";

export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PATH = "/viec-can-xu-ly/[id]/xuat-mau";

const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Xuất mẫu đề nghị (Excel) của một việc trong hộp việc: gọi API đã ký của hệ thống nguồn kèm tài khoản người đang đăng nhập
 * (lấy ở server), hệ thống nguồn tự kiểm tra quyền xem đề nghị và dựng file. Chỉ chuyển tiếp nội dung file + tên file đã kiểm tra.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("inbox.template");
  let account: string;
  try {
    account = (await getCurrentUser()).account;
  } catch (e) {
    if (e instanceof UnauthorizedError) return fail(t("failed"), 401);
    throw e;
  }
  const audit = { action: "item.export_template", actor: `user:${account}`, method: "GET", path: PATH };

  const id = Number((await params).id);
  const found = Number.isInteger(id) && id > 0 ? await findExportableItem(account, id) : null;
  if (!found) {
    await recordAudit({ ...audit, result: "DENIED", status: 404, errorCode: "not_found" });
    return fail(t("notFound"), 404);
  }

  const r = await fetchSourceTemplateFile(found.system, { sourceId: found.item.sourceId, account });
  const where = { system: found.system.key, sourceId: found.item.sourceId };
  if (!r.ok) {
    const status = r.status === 0 ? 502 : r.status;
    await recordAudit({ ...audit, ...where, result: r.status === 401 || r.status === 403 || r.status === 404 ? "DENIED" : "ERROR", status, errorCode: r.status === 0 ? "unreachable" : "rejected" });
    return fail(r.status === 0 ? t("unreachable") : r.message || t("failed"), status);
  }
  await recordAudit({ ...audit, ...where, result: "OK", status: 200 });
  return new Response(r.body, { headers: { "Content-Type": XLSX, "Content-Disposition": r.disposition, "Cache-Control": "no-store" } });
}
