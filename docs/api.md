# API công khai của Việc cần xử lý

Tài liệu cho nhóm phát triển các hệ thống muốn đưa việc duyệt của mình vào trang `/viec-can-xu-ly`.
Mọi đường dẫn bắt đầu bằng `/api/v1`. Dữ liệu là JSON UTF-8 (`Content-Type: application/json; charset=utf-8`).

## 1. Hộp việc là gì

Trang `/viec-can-xu-ly` chỉ đọc một bảng `approval_inbox`. Mỗi dòng là **một bước duyệt gán cho một người** của một đề nghị ở hệ thống nguồn.

- Bảng chỉ là **bản sao tóm tắt** để hiển thị và chuyển người dùng sang hệ thống gốc. Dữ liệu nghiệp vụ và việc duyệt vẫn ở hệ thống gốc. Việc xử lý (xác nhận, phê duyệt, trả lại) làm ở hệ thống gốc: trang chỉ có nút **Mở ở hệ thống gốc** (mở tab mới, `baseUrl` + `deepLink`).
- Khóa duy nhất của một việc: `(system, sourceId, stepNo)`.
- Hệ thống nguồn không "thêm / sửa một dòng" mà gửi **toàn bộ danh sách việc hiện tại của một đề nghị**; hộp việc tự thêm, sửa, xóa cho khớp. Gửi lại cùng nội dung là an toàn.

## 2. Xác thực

Header `Authorization: Bearer <mã>`. Có hai loại mã:

| Mã | Cấp ở đâu | Dùng để |
|---|---|---|
| **Mã quản trị** | Biến môi trường `INBOX_ADMIN_TOKEN` (≥ 32 ký tự) | Đăng ký / sửa / xóa hệ thống, đổi mã API, truy vấn mọi hệ thống |
| **Mã của hệ thống** | Trả **một lần** khi đăng ký hoặc đổi mã (`inb_…`); hộp việc chỉ lưu bản băm SHA-256 | Gửi và truy vấn việc của **chính hệ thống đó**. Dùng cho hệ thống khác bị `403` |

Giữ mã trong biến môi trường của hệ thống nguồn, không ghi vào mã nguồn, log hay tài liệu. Mất mã thì đổi (mục 3.5), mã cũ hết hiệu lực ngay. Chỉ mở API trong mạng nội bộ (tường lửa / IIS giới hạn theo IP của các hệ thống nguồn), dùng HTTPS nếu đi qua mạng không tin cậy. Giới hạn 600 yêu cầu / phút / mã (`429`).

## 3. Quản trị hệ thống nguồn (mã quản trị)

### 3.1 Đăng ký

```
POST /api/v1/systems
{ "key": "kho", "nameVi": "Quản lý kho", "nameJa": "倉庫管理", "baseUrl": "http://kho.fivestar.local:3000" }
```

- `key`: chữ thường, số, `_`, `-`; bắt đầu bằng chữ cái; 2–30 ký tự.
- `baseUrl`: địa chỉ gốc `http(s)://host[:port]`, không kèm đường dẫn / query. Link mở việc = `baseUrl` + `deepLink`.
- `201` → `{ "system": {...}, "token": "inb_..." }`. **`token` chỉ hiện ở đây.** `409 system_exists` nếu khóa đã có.

### 3.2 Danh sách / chi tiết

`GET /api/v1/systems` → `{ "systems": [...] }` (không bao giờ có token / bản băm).
`GET /api/v1/systems/{key}` → `{ "system": {...} }` (mã quản trị hoặc mã của chính hệ thống).

### 3.3 Sửa

```
PATCH /api/v1/systems/{key}
{ "nameVi": "...", "nameJa": "...", "baseUrl": "...", "isActive": false }
```

Chỉ các trường gửi lên được đổi. `isActive: false` = tạm ngưng: hệ thống không gửi được dữ liệu mới và việc của nó **không hiện** trên trang.

### 3.4 Xóa

`DELETE /api/v1/systems/{key}` → `{ "deleted": true }`. `409 system_has_items` nếu còn việc (xóa việc trước hoặc dùng `isActive: false`).

### 3.5 Đổi mã API

`POST /api/v1/systems/{key}/token` → `{ "system": {...}, "token": "inb_..." }`. Mã cũ hết hiệu lực ngay.

## 4. Gửi và quản lý việc (mã của hệ thống, hoặc mã quản trị)

### 4.1 Thay toàn bộ việc của một đề nghị

```
PUT /api/v1/systems/{key}/sources/{sourceId}/items
```

```json
{
  "sourceVersion": "2026-10-29T03:15:00.000Z",
  "items": [
    {
      "stepNo": 1,
      "sourceType": "SUPPLY",
      "role": "CONFIRM",
      "assigneeAccount": "nguyen.van.a",
      "status": "PENDING",
      "code": "ĐN-XĐ-202610-002",
      "title": "Găng tay, khẩu trang",
      "requesterName": "Trần Thị B",
      "priority": "MEDIUM",
      "deepLink": "/de-nghi/12",
      "summary": { "lineCount": 2, "totalQty": 30 },
      "submittedAt": "2026-10-29T02:50:00.000Z",
      "actedAt": null
    }
  ]
}
```

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `sourceVersion` | ISO 8601 có múi giờ, tùy chọn | Mốc của trạng thái ở hệ thống nguồn (mặc định: lúc nhận). Nếu đã lưu bản có mốc mới hơn thì yêu cầu bị bỏ qua (`stale: true`). Lấy mốc **trước khi đọc DB** và gửi tuần tự các lần gửi của cùng một đề nghị |
| `route` | mảng ≤ 50, tùy chọn | **Tuyến phê duyệt đầy đủ** để hiện trong hộp thoại chi tiết, kể cả bước chưa tới lượt. Mỗi phần tử: `stepNo`, `role`, `assigneeAccount`, `assigneeName` (tùy chọn, họ tên), `status` (`WAITING` = chưa tới lượt, hoặc `PENDING` / `DONE` / `RETURNED` / `CANCELLED`), `actedAt`. Bỏ qua = giữ tuyến đã lưu; chưa từng gửi thì hộp thoại chỉ hiện các bước có trong `items`. Chỉ để hiển thị, không tạo việc |
| `items` | mảng ≤ 50 | **Toàn bộ** việc hiện tại của đề nghị. Việc không còn trong danh sách bị xóa. `[]` = xóa mọi việc |
| `stepNo` | số nguyên > 0 | Thứ tự bước, bắt đầu từ 1, không trùng trong một lần gửi |
| `sourceType` | chuỗi 1–30 | Loại đối tượng ở hệ thống nguồn. VD `IN`, `OUT`, `SUPPLY` |
| `role` | `CONFIRM` \| `DECIDE` | Xác nhận / phê duyệt |
| `assigneeAccount` | chuỗi 1–100 | Tài khoản AD người được giao, **không kèm domain** (hộp việc đổi sang chữ thường) |
| `status` | `PENDING` \| `DONE` \| `RETURNED` \| `CANCELLED` | Xem bảng quy đổi bên dưới |
| `code` | chuỗi 1–100 | Số chứng từ hiển thị |
| `title` | chuỗi 1–300 | Nội dung ngắn |
| `requesterName` | chuỗi 1–200 | Tên người đề nghị |
| `priority` | `LOW` \| `MEDIUM` \| `HIGH` | Ưu tiên |
| `deepLink` | chuỗi ≤ 300 | Đường dẫn **tương đối** tới màn xử lý, bắt đầu bằng một `/` (không phải `//`), chỉ ASCII in được, không khoảng trắng / `\`. URL đầy đủ bị từ chối |
| `summary` | object | Chỉ nhận `lineCount`, `totalQty` (số nguyên ≥ 0); khóa lạ bị từ chối. **Không đưa dữ liệu nhạy cảm (VD tồn kho)** |
| `submittedAt` | ISO 8601 có múi giờ | Lúc đề nghị được gửi |
| `actedAt` | ISO 8601 \| `null` | Lúc bước này được xử lý |

Kết quả `200`: `{ "changed": true|false, "stale": true|false }`.

**Quy đổi trạng thái** (chỉ gửi bước đã tới lượt hoặc đã xong):

| Bước ở hệ thống nguồn | Gửi |
|---|---|
| Chưa tới lượt (chờ bước trước) | **Không gửi** |
| Đang chờ người được giao | `PENDING` (chỉ khi cả đề nghị còn đang duyệt) |
| Đã xác nhận / phê duyệt | `DONE` |
| Đã trả lại | `RETURNED` |
| Đề nghị bị hủy | `CANCELLED` |

Trang: tab "Chờ tôi xử lý" = `PENDING`; tab "Tôi đã xử lý" = các trạng thái còn lại.

**Khi nào gửi:** mỗi khi trạng thái bước duyệt đổi — gửi duyệt, xác nhận / phê duyệt, trả lại, thu hồi (gửi `items: []`), hủy, xóa đề nghị. Gửi sau khi giao dịch nghiệp vụ đã commit; lỗi thì thử lại (idempotent). Nên có thêm bước đối soát định kỳ (VD mỗi giờ / đêm) gửi lại mọi đề nghị đang duyệt để sửa sự kiện bị lỡ — hệ thống kho đã làm như vậy.

### 4.2 Xóa mọi việc của một đề nghị

`DELETE /api/v1/systems/{key}/sources/{sourceId}/items` → `{ "changed": ..., "stale": false }` (tương đương `PUT` với `items: []`).

### 4.3 Sửa một phần một việc

```
PATCH /api/v1/systems/{key}/sources/{sourceId}/items/{stepNo}
{ "status": "DONE", "actedAt": "2026-10-29T04:00:00.000Z" }
```

Chỉ các trường gửi lên được đổi (không đổi `stepNo`); trả `{ "item": {...} }`; `404 item_not_found` nếu việc không có. Dùng cho sửa lẻ; luồng chính nên dùng `PUT` để luôn khớp toàn bộ đề nghị.

### 4.4 Truy vấn

| Yêu cầu | Trả |
|---|---|
| `GET /api/v1/systems/{key}/sources/{sourceId}/items` | Các việc của một đề nghị |
| `GET /api/v1/systems/{key}/items?sourceId=&assignee=&status=&q=&page=&size=` | Việc của một hệ thống |
| `GET /api/v1/items?system=&sourceId=&assignee=&status=&q=&page=&size=` | Việc của mọi hệ thống (chỉ mã quản trị) |

Phân trang: `page` (từ 1), `size` (1–100, mặc định 20). Kết quả `{ "items": [...], "page": n, "size": n, "total": n }`, sắp theo `id` tăng dần. Mỗi phần tử:

```json
{
  "id": 1, "system": "kho", "sourceType": "SUPPLY", "sourceId": "12", "stepNo": 1, "role": "CONFIRM",
  "assigneeAccount": "nguyen.van.a", "status": "PENDING", "code": "ĐN-XĐ-202610-002",
  "title": "...", "requesterName": "...", "priority": "MEDIUM", "deepLink": "/de-nghi/12",
  "url": "http://kho.fivestar.local:3000/de-nghi/12",
  "summary": { "lineCount": 2, "totalQty": 30 },
  "submittedAt": "2026-10-29T02:50:00.000Z", "actedAt": null, "sourceVersion": "2026-10-29T03:15:00.000Z"
}
```

## 5. Lỗi

```json
{ "error": { "code": "invalid_request", "message": "Dữ liệu gửi lên không hợp lệ", "fields": [{ "path": "items.0.deepLink", "message": "..." }] } }
```

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `invalid_request`, `invalid_json`, `invalid_base_url`, `invalid_source_id`, `invalid_step_no`, `duplicate_step` | Sai dữ liệu / schema |
| 401 | `unauthorized` | Thiếu hoặc sai mã |
| 403 | `forbidden`, `system_inactive` | Mã không thuộc hệ thống này / không phải mã quản trị / hệ thống tạm ngưng |
| 404 | `system_not_found`, `item_not_found` | Chưa đăng ký / không có việc |
| 409 | `system_exists`, `system_has_items` | Trùng khóa / còn việc |
| 413 | `body_too_large` | Thân yêu cầu > 256 KB |
| 429 | `rate_limited` | Vượt giới hạn tần suất |
| 500 | `internal_error` | Lỗi máy chủ (chi tiết chỉ ở log máy chủ) |

## 6. Danh sách kiểm tra khi thêm một hệ thống

- [ ] Quản trị đăng ký hệ thống (3.1), lưu `token` vào biến môi trường của hệ thống nguồn.
- [ ] Gọi `PUT` (4.1) ở **mọi** nơi đổi trạng thái bước duyệt, **sau khi commit**; lỗi thì ghi log và thử lại.
- [ ] Luôn gửi **toàn bộ** việc hiện tại của đề nghị; không gửi bước chưa tới lượt; thu hồi / xóa gửi `items: []`.
- [ ] `assigneeAccount` khớp tài khoản AD (không kèm domain) mà người dùng đăng nhập bằng.
- [ ] `deepLink` là đường dẫn tương đối mở đúng màn xử lý; `baseUrl` của hệ thống đúng địa chỉ người dùng truy cập được.
- [ ] Có đối soát định kỳ gửi lại mọi đề nghị đang duyệt.
- [ ] Thử: gửi duyệt → xác nhận sang bước kế → trả lại → thu hồi → xóa; kiểm tra hai tab sau mỗi bước.

## 7. Xử lý ngay trên hộp việc (Xác nhận / Phê duyệt / Trả lại)

Hệ thống nào bật `inlineAct` thì dòng việc đang chờ có thêm nút **Xác nhận / Phê duyệt** và **Trả lại**. Khi người dùng bấm, **server của hộp việc** gọi API xử lý của hệ thống nguồn; trình duyệt không gọi trực tiếp.

**Phân quyền theo tài khoản domain của người đang mở hộp việc.** Hộp việc lấy tài khoản từ SSO / IIS ở server (không nhận từ trình duyệt) và đưa vào yêu cầu. Hệ thống nguồn **không tin hộp việc về quyền**: tự tra tài khoản đó trong danh sách người dùng của mình, tự kiểm tra người đó đúng là người được giao ở bước hiện tại, và áp dụng mọi quy tắc nghiệp vụ như khi người đó thao tác trên chính hệ thống. Mọi hệ thống nguồn cần dùng cùng domain AD.

### 7.1 Bật cho một hệ thống (mã quản trị)

1. Bật: `PATCH /api/v1/systems/{key}` với `{ "inlineAct": true }` (hoặc truyền `inlineAct` khi đăng ký).
2. Lấy bí mật ký: `GET /api/v1/systems/{key}/action-secret` → `{ "secret": "...", "version": 1 }`. Đặt vào cấu hình của hệ thống nguồn (VD kho: `INBOX_ACT_SECRET`).
3. Đổi bí mật: `POST /api/v1/systems/{key}/action-secret` (bí mật cũ hết hiệu lực ngay, phải đặt lại ở hệ thống nguồn).

Hộp việc cần `INBOX_SIGNING_KEY` (≥ 32 ký tự) trong `.env`; bí mật của từng hệ thống suy ra từ khóa này, khóa hệ thống và phiên bản nên không lưu trong DB.

### 7.2 API hệ thống nguồn phải cung cấp

```
POST {baseUrl}/api/inbox/act
Content-Type: application/json
x-inbox-timestamp: <mili giây Unix>
x-inbox-signature: <hex HMAC-SHA256(secret, "<timestamp>.<thân yêu cầu nguyên văn>")>
```

```json
{ "sourceId": "12", "stepNo": 1, "action": "approve", "comment": "", "account": "nguyen.van.a", "nonce": "b0c1…uuid" }
```

- `action`: `approve` (xác nhận / phê duyệt) hoặc `return` (trả lại, bắt buộc có `comment`).
- `account`: tài khoản domain người bấm, không kèm domain, chữ thường.

Hệ thống nguồn **phải**:
1. Kiểm tra chữ ký bằng so sánh thời gian không đổi và từ chối nếu `x-inbox-timestamp` lệch quá 60 giây (`401`).
2. Chống phát lại: nhớ `nonce` đã dùng ít nhất 5 phút (`401`).
3. Tra `account` trong người dùng đang hoạt động của mình (`403` nếu không có).
4. Xác minh việc còn đang chờ đúng người đó ở bước `stepNo` (`409` nếu không); sau đó thực hiện thao tác với đầy đủ kiểm tra nghiệp vụ, ghi nhật ký và thông báo của chính nó.
5. Đẩy trạng thái mới sang hộp việc bằng `PUT` (mục 4.1) **trước khi trả lời**, để danh sách trên hộp việc làm mới đúng ngay.
6. Không bao giờ lấy quyền từ nơi khác ngoài tài khoản trong yêu cầu đã ký.

Phản hồi (JSON):

| HTTP | Thân | Ý nghĩa |
|---|---|---|
| 200 | `{ "ok": true, "message": "...", "approved": true }` | Đã xử lý. `approved: true` = phê duyệt cuối cùng |
| 401 | `{ "ok": false, "code": "bad_signature" \| "replayed" }` | Chữ ký sai / hết hạn / phát lại |
| 403 | `{ "ok": false, "code": "unknown_user", "message": "..." }` | Tài khoản không có quyền ở hệ thống này |
| 409 | `{ "ok": false, "code": "not_actionable", "message": "..." }` | Việc không còn chờ người này |
| 422 | `{ "ok": false, "code": "rejected", "message": "..." }` | Từ chối theo nghiệp vụ (VD không đủ tồn) |

`message` là câu ngắn (≤ 500 ký tự) hiển thị nguyên văn cho người dùng; **không** đưa chi tiết nội bộ vào. Hộp việc không chuyển tiếp nội dung khác.

### 7.3 Triển khai

- Chỉ mở đường dẫn này trong mạng nội bộ cho máy chủ hộp việc. Đây là cuộc gọi giữa hai máy chủ nên **không có người dùng Windows**: nếu hệ thống nguồn bắt SSO cho mọi đường dẫn (SSPI / IIS Windows Authentication), phải để ngỏ riêng `POST /api/inbox/act` (chữ ký thay cho SSO). Với `server.js` SSPI: đăng ký route trước `sso.auth()` (kho đã làm). Với IIS: cho phép Anonymous riêng đường dẫn này.
- Hệ thống nào chưa có API này giữ `inlineAct = false`: người dùng vẫn dùng **Mở ở hệ thống gốc**.
- Hộp việc ghi audit (file) mỗi lần bấm: `item.approve` / `item.return`, `actor` = `user:<tài khoản>`.
- Rủi ro cần chấp nhận: ai nắm `INBOX_SIGNING_KEY` hoặc bí mật của một hệ thống có thể xử lý thay người khác trong phạm vi các việc đang chờ người đó ở hệ thống ấy. Giữ các khóa này như mật khẩu quản trị.
