# Việc cần xử lý (kujiraa-inbox)

Trang tổng hợp **các bước duyệt đang chờ một người** ở nhiều hệ thống (kho, ...). Project Next.js 15 (App Router) độc lập,
database PostgreSQL riêng, Drizzle ORM. Các hệ thống nguồn gửi việc sang qua API công khai [`/api/v1`](docs/api.md);
người dùng chỉ xem và bấm **Mở ở hệ thống gốc** (tab mới) để xử lý tại hệ thống đó.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `app/(app)/viec-can-xu-ly` | Trang chính: tab Chờ tôi xử lý / Tôi đã xử lý, lọc hệ thống, tìm kiếm, sắp xếp + phân trang (trên URL) |
| `app/api/v1` | API công khai cho hệ thống nguồn (xác thực bằng mã Bearer, xem [docs/api.md](docs/api.md)) |
| `lib/contract.ts` | Hợp đồng dữ liệu (zod): mọi việc ghi vào đều đi qua đây |
| `lib/store.ts` | Ghi (`replaceForSource`, `patchItem`) và đọc (`listItems`, `listInbox`) bảng `approval_inbox` |
| `lib/systems.ts` | Đăng ký hệ thống nguồn, mã API (chỉ lưu SHA-256) |
| `lib/auth-identity.ts`, `middleware.ts` | Danh tính người dùng (cùng cơ chế AD / SSO với hệ thống kho) |
| `db/schema.ts` | `inbox_systems`, `approval_inbox`; migration trong `db/migrations` |

## Chạy

```
npm install
cp .env.example .env        # điền DATABASE_URL, INBOX_ADMIN_TOKEN, AUTH_AD_DOMAIN
npm run db:create           # (tùy chọn) tạo DB + tài khoản: xem scripts/create-db.mjs
npm run db:migrate
npm run dev                 # http://localhost:3001/inbox  (dev: gõ tài khoản thử ở thanh trên cùng)
```

Ứng dụng chạy dưới tiền tố `/inbox` (`basePath`, `lib/base-path.ts`) để dùng chung domain với kho (`/storage`): mọi URL dựng tay
(`fetch`, `<a href>`, `window.open`) phải đi qua `withBasePath()`; `next/link`, `redirect()`, `router.push` tự thêm tiền tố.
API cho hệ thống nguồn vì vậy nằm ở `/inbox/api/v1`.

Production: `npm run build && npm run start` — chạy `.next/standalone/server.js` do chính Next sinh (`output: "standalone"`);
`scripts/post-build.mjs` vá mặc định cổng 3001 + hostname `127.0.0.1` và copy `public/`, `.next/static`.
Không còn `server.js` / SSPI / Express tự viết. Triển khai Windows Server + IIS offline: [docs/trien-khai-iis-offline.md](docs/trien-khai-iis-offline.md)
(`deploy/build-release.ps1` → `deploy/install.ps1`).
LAN test không có domain thật: `npm run dev:test` / `npm run start:test` (cần `TEST_LOGIN_CODE`).
`npm run typecheck`, `npm run lint`.

## Đăng nhập

Danh tính lấy như hệ thống kho: `iis` (mặc định khi `NODE_ENV=production`: IIS Windows Authentication + proxy, header `x-remote-user` = `DOMAIN\account`,
**không có mã bí mật** — Node chỉ nghe `127.0.0.1` nên chỉ IIS trên cùng máy gọi tới được), `test` (hộp thoại Basic), `dev` (cookie, chỉ khi chạy dev hoặc `ALLOW_USER_SWITCH=1`).
Không có bảng người dùng: ai xác thực được **chỉ thấy việc có `assignee_account` trùng tài khoản của mình**
(tài khoản AD không kèm domain, chữ thường). `/api/v1` không dùng danh tính Windows mà dùng mã Bearer.

## Thêm một hệ thống nguồn

1. Đăng ký: `POST /api/v1/systems` bằng mã quản trị (`INBOX_ADMIN_TOKEN`) → nhận mã API của hệ thống (chỉ hiện một lần).
2. Hệ thống nguồn gọi `PUT /api/v1/systems/{key}/sources/{sourceId}/items` mỗi khi bước duyệt đổi.

Chi tiết, ví dụ và danh sách kiểm tra: [docs/api.md](docs/api.md).

## Nhật ký hoạt động (audit)

Mỗi yêu cầu tới `/api/v1` (kể cả bị từ chối hoặc lỗi) ghi một dòng JSON vào file `<AUDIT_LOG_DIR>/audit-YYYY-MM-DD.log` (mặc định thư mục `logs/`, giờ UTC, thư mục đã nằm trong `.gitignore`):

```json
{"ts":"2026-10-29T02:18:55.304Z","action":"source.replace","result":"OK","status":200,"actor":"system:kho","method":"PUT","path":"/api/v1/systems/kho/sources/99999/items","system":"kho","sourceId":"99999","detail":{"items":0,"changed":false,"stale":false}}
```

- `actor`: `admin`, `system:<khóa>` hoặc `anonymous` (chưa xác thực được); `result`: `OK` / `DENIED` (401, 403) / `ERROR`.
- Mã thao tác: `system.list|create|get|update|delete|rotate_token`, `item.list|list_all|patch`, `source.get|replace|delete`.
- Không ghi mã API, nội dung thân yêu cầu hay địa chỉ IP. Ghi nhật ký không bao giờ làm lỗi yêu cầu (lỗi ghi file chỉ ra console).
- Không tự xóa file cũ: dọn / lưu trữ theo quy định. Kho đối soát mỗi giờ nên mỗi giờ có một loạt dòng `source.replace`.

## Ghi chú vận hành

- Kho dữ liệu chỉ là bản sao: mất bảng `approval_inbox` thì hệ thống nguồn đối soát lại (kho tự gửi lại mọi đề nghị đang duyệt mỗi giờ).
- Mã API và `INBOX_ADMIN_TOKEN` không được ghi vào log, nhật ký hay mã nguồn.
- Giao diện có tiếng Việt (mặc định) và tiếng Nhật: `messages/vi.json` và `messages/ja.json` phải có cùng khóa; chữ trong JSX lấy từ `useTranslations` / `getTranslations` (ESLint `react/jsx-no-literals`).
