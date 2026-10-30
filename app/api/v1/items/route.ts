import { json, readQuery, requireAdmin, route } from "@/lib/api";
import { listQuerySchema } from "@/lib/contract";
import { listItems } from "@/lib/store";
import { z } from "zod";

/** Truy vấn việc của mọi hệ thống: ?system=&sourceId=&assignee=&status=&q=&page=&size= (mã quản trị) */
export const GET = route("item.list_all", async (req) => {
  await requireAdmin(req);
  const { page, size, ...filter } = readQuery(req, listQuerySchema.extend({ system: z.string().max(30).optional() }));
  return json(await listItems(filter, page, size));
});
