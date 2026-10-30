import { auditDetail } from "@/lib/audit";
import { json, readJson, requireAdmin, route } from "@/lib/api";
import { createSystemSchema } from "@/lib/contract";
import { createSystem, listSystems } from "@/lib/systems";

/** Danh sách hệ thống đã đăng ký (mã quản trị) */
export const GET = route("system.list", async (req) => {
  await requireAdmin(req);
  return json({ systems: await listSystems() });
});

/** Đăng ký hệ thống mới (mã quản trị). Mã API của hệ thống chỉ trả ở đây một lần */
export const POST = route("system.create", async (req) => {
  await requireAdmin(req);
  const input = await readJson(req, createSystemSchema);
  auditDetail({ key: input.key });
  return json(await createSystem(input), 201);
});
