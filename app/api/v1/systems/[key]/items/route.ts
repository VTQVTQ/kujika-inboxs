import { json, readQuery, requireSystem, route } from "@/lib/api";
import { listQuerySchema } from "@/lib/contract";
import { listItems } from "@/lib/store";
import { getSystemOrThrow } from "@/lib/systems";

/** Truy vấn việc của một hệ thống: ?sourceId=&assignee=&status=&q=&page=&size= (mã quản trị hoặc mã của chính hệ thống) */
export const GET = route("item.list", async (req, { params }: { params: Promise<{ key: string }> }) => {
  const { key } = await params;
  await requireSystem(req, key);
  await getSystemOrThrow(key);
  const { page, size, ...filter } = readQuery(req, listQuerySchema);
  return json(await listItems({ ...filter, system: key }, page, size));
});
