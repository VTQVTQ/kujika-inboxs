import { json, requireAdmin, route } from "@/lib/api";
import { rotateSystemToken } from "@/lib/systems";

/** Cấp mã API mới cho hệ thống (mã quản trị): mã cũ hết hiệu lực ngay, mã mới chỉ trả ở đây một lần */
export const POST = route("system.rotate_token", async (req, { params }: { params: Promise<{ key: string }> }) => {
  const { key } = await params;
  await requireAdmin(req);
  return json(await rotateSystemToken(key));
});
