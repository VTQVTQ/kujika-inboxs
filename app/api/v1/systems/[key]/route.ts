import { auditDetail } from "@/lib/audit";
import { json, readJson, requireAdmin, requireSystem, route } from "@/lib/api";
import { patchSystemSchema } from "@/lib/contract";
import { deleteSystem, getSystemOrThrow, updateSystem } from "@/lib/systems";

type Ctx = { params: Promise<{ key: string }> };

/** Thông tin một hệ thống (mã quản trị, hoặc mã của chính hệ thống đó) */
export const GET = route("system.get", async (req, { params }: Ctx) => {
  const { key } = await params;
  await requireSystem(req, key);
  const { tokenHash: _tokenHash, ...system } = await getSystemOrThrow(key);
  return json({ system });
});

/** Sửa tên / địa chỉ gốc / tạm ngưng (mã quản trị) */
export const PATCH = route("system.update", async (req, { params }: Ctx) => {
  const { key } = await params;
  await requireAdmin(req);
  const input = await readJson(req, patchSystemSchema);
  auditDetail({ fields: Object.keys(input).join(",") });
  return json({ system: await updateSystem(key, input) });
});

/** Xóa hệ thống chưa có việc nào (mã quản trị) */
export const DELETE = route("system.delete", async (req, { params }: Ctx) => {
  const { key } = await params;
  await requireAdmin(req);
  await deleteSystem(key);
  return json({ deleted: true });
});
