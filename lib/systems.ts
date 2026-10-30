import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { approvalInbox, inboxSystems, type InboxSystemRow } from "@/db/schema";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { type z } from "zod";
import { deriveActionSecret } from "@/lib/act";
import { type createSystemSchema, normalizeBaseUrl, type patchSystemSchema } from "@/lib/contract";

/** Tiền tố của mã API (dễ nhận ra khi lộ trong log / kho mã nguồn) */
const TOKEN_PREFIX = "inb_";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function newToken() {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** Hệ thống trả ra ngoài: không bao giờ có token / bản băm */
export type PublicSystem = Omit<InboxSystemRow, "tokenHash">;

function toPublic({ tokenHash: _tokenHash, ...rest }: InboxSystemRow): PublicSystem {
  return rest;
}

function baseUrlOrThrow(raw: string) {
  const url = normalizeBaseUrl(raw);
  if (!url) throw new ApiError(400, "invalid_base_url", "baseUrl phải là địa chỉ http(s) gốc, không kèm đường dẫn");
  return url;
}

export async function listSystems() {
  return (await db.select().from(inboxSystems).orderBy(asc(inboxSystems.key))).map(toPublic);
}

export async function getSystem(key: string) {
  const [row] = await db.select().from(inboxSystems).where(eq(inboxSystems.key, key)).limit(1);
  return row ?? null;
}

export async function getSystemOrThrow(key: string) {
  const row = await getSystem(key);
  if (!row) throw new ApiError(404, "system_not_found", "Hệ thống chưa được đăng ký");
  return row;
}

/** Hệ thống có mã này (so bản băm); null nếu không có */
export async function findSystemByToken(token: string) {
  const [row] = await db.select().from(inboxSystems).where(eq(inboxSystems.tokenHash, hashToken(token))).limit(1);
  return row ?? null;
}

/** Đăng ký hệ thống mới. Mã API chỉ trả ở đây một lần */
export async function createSystem(input: z.output<typeof createSystemSchema>) {
  const token = newToken();
  const [row] = await db
    .insert(inboxSystems)
    .values({ ...input, baseUrl: baseUrlOrThrow(input.baseUrl), tokenHash: hashToken(token) })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new ApiError(409, "system_exists", "Khóa hệ thống đã tồn tại");
  return { system: toPublic(row), token };
}

export async function updateSystem(key: string, input: z.output<typeof patchSystemSchema>) {
  const { baseUrl, ...rest } = input;
  const [row] = await db
    .update(inboxSystems)
    .set({ ...rest, ...(baseUrl !== undefined ? { baseUrl: baseUrlOrThrow(baseUrl) } : {}), updatedAt: new Date() })
    .where(eq(inboxSystems.key, key))
    .returning();
  if (!row) throw new ApiError(404, "system_not_found", "Hệ thống chưa được đăng ký");
  return toPublic(row);
}

/** Đổi mã API (mã cũ hết hiệu lực ngay). Mã mới chỉ trả ở đây một lần */
export async function rotateSystemToken(key: string) {
  const token = newToken();
  const [row] = await db.update(inboxSystems).set({ tokenHash: hashToken(token), updatedAt: new Date() }).where(eq(inboxSystems.key, key)).returning();
  if (!row) throw new ApiError(404, "system_not_found", "Hệ thống chưa được đăng ký");
  return { system: toPublic(row), token };
}

/** Xóa hệ thống: chỉ khi không còn việc nào (muốn ngừng dùng thì đặt isActive = false) */
export async function deleteSystem(key: string) {
  const [item] = await db.select({ id: approvalInbox.id }).from(approvalInbox).where(eq(approvalInbox.sourceSystem, key)).limit(1);
  if (item) throw new ApiError(409, "system_has_items", "Hệ thống còn việc trong hộp việc: xóa các việc trước hoặc đặt isActive = false");
  const deleted = await db.delete(inboxSystems).where(eq(inboxSystems.key, key)).returning({ key: inboxSystems.key });
  if (!deleted.length) throw new ApiError(404, "system_not_found", "Hệ thống chưa được đăng ký");
}

/** Bí mật ký lời gọi xử lý của hệ thống (chỉ quản trị lấy được). Đổi bí mật: tăng phiên bản, bí mật cũ hết hiệu lực ngay */
export async function getActionSecret(key: string, rotate: boolean) {
  const system = await getSystemOrThrow(key);
  const version = rotate ? system.actionSecretVersion + 1 : system.actionSecretVersion;
  if (rotate) await db.update(inboxSystems).set({ actionSecretVersion: version, updatedAt: new Date() }).where(eq(inboxSystems.key, key));
  return { secret: deriveActionSecret(key, version), version };
}

/** Link mở việc ở hệ thống gốc = địa chỉ gốc + deep_link */
export const itemUrl = (baseUrl: string, deepLink: string) => baseUrl + deepLink;
