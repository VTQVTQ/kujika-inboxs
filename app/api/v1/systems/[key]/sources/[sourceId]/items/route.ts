import { auditDetail } from "@/lib/audit";
import { json, parseSourceId, readJson, requireSystem, route } from "@/lib/api";
import { replaceSourceSchema } from "@/lib/contract";
import { listItems, replaceForSource } from "@/lib/store";
import { getSystemOrThrow } from "@/lib/systems";

type Ctx = { params: Promise<{ key: string; sourceId: string }> };

/** Các việc hiện có của một đề nghị */
export const GET = route("source.get", async (req, { params }: Ctx) => {
  const { key, sourceId } = await params;
  await requireSystem(req, key);
  await getSystemOrThrow(key);
  return json(await listItems({ system: key, sourceId: parseSourceId(sourceId) }, 1, 100));
});

/**
 * Thay toàn bộ việc của một đề nghị bằng danh sách gửi lên (thêm / sửa / xóa cho khớp). Gửi lại cùng nội dung là an toàn.
 * items rỗng = xóa mọi việc của đề nghị. Trả { changed, stale }: stale = đã có bản mới hơn (sourceVersion), bản này bị bỏ qua.
 */
export const PUT = route("source.replace", async (req, { params }: Ctx) => {
  const { key, sourceId } = await params;
  await requireSystem(req, key);
  const system = await getSystemOrThrow(key);
  if (!system.isActive) return json({ error: { code: "system_inactive", message: "Hệ thống đang tạm ngưng" } }, 403);
  const body = await readJson(req, replaceSourceSchema);
  const result = await replaceForSource(key, parseSourceId(sourceId), body.items, body.sourceVersion, body.route);
  auditDetail({ items: body.items.length, changed: result.changed, stale: result.stale });
  return json(result);
});

/** Xóa mọi việc của một đề nghị (đề nghị bị xóa ở hệ thống nguồn) */
export const DELETE = route("source.delete", async (req, { params }: Ctx) => {
  const { key, sourceId } = await params;
  await requireSystem(req, key);
  await getSystemOrThrow(key);
  const result = await replaceForSource(key, parseSourceId(sourceId), []);
  auditDetail({ changed: result.changed });
  return json(result);
});
