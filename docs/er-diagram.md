# Sơ đồ ER – Việc cần xử lý (kujiraa-inbox)

Nguồn: [`db/schema.ts`](../db/schema.ts). Database PostgreSQL riêng, Drizzle ORM.
DB chỉ là **bản sao tóm tắt** để hiển thị; dữ liệu nghiệp vụ và việc duyệt thật vẫn ở hệ thống nguồn.

## Sơ đồ

```mermaid
erDiagram
    inbox_systems ||--o{ approval_inbox : "gửi việc (source_system → key, ON DELETE RESTRICT)"

    inbox_systems {
        text key PK "vd: kho"
        text name_vi
        text name_ja
        text base_url "gốc URL hệ thống, không có / cuối"
        text token_hash "SHA-256 của mã API"
        boolean inline_act "default false"
        int action_secret_version "default 1"
        boolean is_active "default true"
        timestamptz created_at
        timestamptz updated_at
    }

    approval_inbox {
        serial id PK
        text source_system FK
        text source_type "IN / OUT / SUPPLY"
        text source_id "mã đề nghị ở hệ thống gốc"
        int step_no "CHECK > 0"
        StepRole role "CONFIRM | DECIDE"
        text assignee_account "tài khoản AD, chữ thường"
        InboxStatus status "PENDING | DONE | RETURNED | CANCELLED"
        text code "số chứng từ"
        text title
        text requester_name
        RequestPriority priority "LOW | MEDIUM | HIGH, default LOW"
        text deep_link "đường dẫn tương đối"
        jsonb summary "lineCount, totalQty"
        timestamptz submitted_at
        timestamptz acted_at "nullable"
        timestamptz source_version "chống ghi đè bản đồng bộ cũ"
    }
```

## Enum

| Enum | Giá trị |
|---|---|
| `StepRole` | `CONFIRM` (xác nhận), `DECIDE` (phê duyệt) |
| `RequestPriority` | `LOW`, `MEDIUM`, `HIGH` |
| `InboxStatus` | `PENDING` (chờ), `DONE` (đã xử lý), `RETURNED` (trả lại), `CANCELLED` (hủy/thu hồi ở hệ thống gốc) |

## Index và ràng buộc

| Tên | Bảng | Nội dung |
|---|---|---|
| `approval_inbox_source_step_key` (unique) | `approval_inbox` | `(source_system, source_id, step_no)` – định danh một bước duyệt, đích của upsert |
| `approval_inbox_assignee_status_idx` | `approval_inbox` | `(assignee_account, status, submitted_at, id)` – truy vấn "việc của tôi" |
| `approval_inbox_step_no_positive` (check) | `approval_inbox` | `step_no > 0` |
| FK `source_system → inbox_systems.key` | `approval_inbox` | `ON DELETE RESTRICT` |

## Ghi chú thiết kế

- Không có bảng người dùng: người đăng nhập chỉ thấy dòng có `assignee_account` trùng tài khoản AD của mình.
- `inbox_systems.token_hash` chỉ lưu bản băm; mã API gốc hiện một lần khi tạo/đổi.
- `approval_inbox.source_version`: bản đồng bộ cũ hơn bản đã lưu bị bỏ qua (`stale`).
- Mất bảng `approval_inbox` thì hệ thống nguồn đối soát lại (kho gửi lại mỗi giờ).
