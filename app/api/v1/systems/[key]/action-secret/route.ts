import { json, requireAdmin, route } from "@/lib/api";
import { getActionSecret } from "@/lib/systems";

type Ctx = { params: Promise<{ key: string }> };

/** Bí mật ký lời gọi xử lý hiện tại của hệ thống (mã quản trị): đặt ở hệ thống nguồn để kiểm tra chữ ký của hộp việc */
export const GET = route("system.action_secret", async (req, { params }: Ctx) => {
  const { key } = await params;
  await requireAdmin(req);
  return json(await getActionSecret(key, false));
});

/** Đổi bí mật (mã quản trị): bí mật cũ hết hiệu lực ngay, phải đặt lại ở hệ thống nguồn */
export const POST = route("system.rotate_action_secret", async (req, { params }: Ctx) => {
  const { key } = await params;
  await requireAdmin(req);
  return json(await getActionSecret(key, true));
});
