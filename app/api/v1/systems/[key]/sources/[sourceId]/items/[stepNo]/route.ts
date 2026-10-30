import { auditDetail } from "@/lib/audit";
import { json, parseSourceId, parseStepNo, readJson, requireSystem, route } from "@/lib/api";
import { patchItemSchema } from "@/lib/contract";
import { patchItem, toApiItem } from "@/lib/store";
import { getSystemOrThrow } from "@/lib/systems";

/** Sửa một phần một việc: chỉ các trường gửi lên được đổi (VD { "status": "DONE", "actedAt": "..." }) */
export const PATCH = route("item.patch", async (req, { params }: { params: Promise<{ key: string; sourceId: string; stepNo: string }> }) => {
  const { key, sourceId, stepNo } = await params;
  await requireSystem(req, key);
  const system = await getSystemOrThrow(key);
  const patch = await readJson(req, patchItemSchema);
  auditDetail({ fields: Object.keys(patch).join(",") });
  const row = await patchItem(key, parseSourceId(sourceId), parseStepNo(stepNo), patch);
  return json({ item: toApiItem(row, system.baseUrl) });
});
