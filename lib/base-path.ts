/** Tiền tố đường dẫn của app (basePath trong next.config.ts) khi chạy sau IIS/reverse proxy chung domain với app khác (kho ở /storage). */
export const BASE_PATH = "/inbox";

/**
 * Thêm BASE_PATH vào URL tuyệt đối dựng thủ công (fetch(), window.open(), form action, <a>/<img> href/src).
 * Next.js tự thêm basePath cho next/link, redirect(), router.push, next/image — KHÔNG cần gọi hàm này cho các trường hợp đó.
 */
export function withBasePath(path: string) {
  return `${BASE_PATH}${path}`;
}
