# Triển khai Việc cần xử lý (inbox) trên máy chủ nội bộ (không internet) — cài tự động, SSO qua IIS

Tài liệu cho người cài đặt / IT khi **không có ai hỗ trợ và không có internet**. Làm đúng thứ tự: **A → B → C → D**.
Mọi việc nặng đã gói trong 3 script; phần F là cách làm tay từng bước nếu script dừng giữa chừng.
Cấu trúc giống bộ cài của hệ thống kho (`kujiraa`, `deploy/install.ps1`) — khác biệt được nêu ở mục 0.

## 0. Kiến trúc và điểm khác với kho

IIS đứng trước làm Windows Authentication rồi proxy sang Node; Node chỉ nghe `127.0.0.1` (không ai ngoài máy gọi được).
Cần thêm tính năng IIS + URL Rewrite + ARR (script cài từ `vendor\`).

IIS gắn header khi chuyển yêu cầu sang Node — `x-remote-user` = `DOMAIN\tài-khoản`. Ứng dụng tin trực tiếp header này
(**không có mã bí mật**); an toàn chỉ dựa vào việc Node chỉ nghe loopback.

```
Trình duyệt ──(Windows Auth)──────────► IIS :80 ──(+x-remote-user)──► Node 127.0.0.1:3001 ──► PostgreSQL "inbox"
Hệ thống nguồn (kho…) ──(Bearer)──────► IIS :80/inbox/api/v1 (Anonymous) ─(x-remote-user rỗng)─► Node
                                          web.config: rewrite             NSSM service "InboxServer"
```

| | Kho | Việc cần xử lý (inbox) |
|---|---|---|
| Đường dẫn gốc (basePath) | `/storage` | `/inbox` |
| Cổng Node / dịch vụ / site IIS | 9006 / `KhoServer` / `Kho` | 3001 / `InboxServer` / `Inbox` |
| Database | `kho` (+ đọc `rvsc_acc_db`) | `inbox` riêng, **không** có bảng người dùng, **không** đọc `rvsc_acc_db` |
| Phân quyền | nhóm `group-admin` trong `rvsc_acc_db` | ai xác thực được chỉ thấy việc có `assignee_account` trùng tài khoản của mình |
| **API máy gọi máy** | `POST /storage/api/inbox/act` do app tự bỏ qua danh tính Windows | **`/inbox/api/v1/*` phải cho Anonymous ở IIS** (mục 0.1) |
| Ảnh tải lên | có (`storage\uploads`) | không có |
| Khóa cần sao lưu | `SETTINGS_SECRET_KEY` | `INBOX_ADMIN_TOKEN`, `INBOX_SIGNING_KEY` + nhật ký API |

### 0.1 Vì sao `/inbox/api/v1` phải cho Anonymous

Site IIS tắt Anonymous, bật Windows Authentication để người dùng đăng nhập bằng tài khoản domain. Nhưng hệ thống nguồn
(kho…) gọi `/inbox/api/v1/…` từ máy chủ này sang máy chủ khác bằng mã Bearer, **không có người dùng Windows**. Nếu IIS vẫn đòi
Windows Authentication cho đường dẫn đó thì IIS trả 401 (`WWW-Authenticate: Negotiate`) trước khi yêu cầu tới được ứng dụng.

`install.ps1` (bước 8) xử lý bằng cấu hình riêng cho đường dẫn `Inbox/inbox/api/v1`:

- `Set-WebConfigurationProperty -PSPath MACHINE/WEBROOT/APPHOST -Location "Inbox/inbox/api/v1" …` → `anonymousAuthentication enabled = true`,
  `windowsAuthentication enabled = false`. Thẻ `<location>` nằm ở `applicationHost.config` nên **không cần mở khóa** mục authentication
  (nếu đặt `<location>` trong `web.config` của site thì phải mở khóa `overrideModeDefault="Allow"` trước, mặc định bị khóa).
- Tạo sẵn thư mục rỗng `iis\inbox\api\v1` trong site để đường dẫn tồn tại thật (IIS Manager chọn được).
- Rule `InboxProxy` trong `web.config` vẫn áp dụng cho đường dẫn này (rewrite chạy sau bước xác thực) nên yêu cầu vẫn được chuyển sang Node.
  Với yêu cầu ẩn danh `{LOGON_USER}` rỗng ⇒ header `x-remote-user` rỗng, và nó **ghi đè** header do client tự gửi.
- Ứng dụng (`middleware.ts`) bỏ qua danh tính Windows ở `/api/v1` và chỉ xác thực bằng mã Bearer trong từng route.
  Giới hạn truy cập bổ sung (IP của máy chủ nguồn) nên đặt ở tường lửa / IIS IP restrictions — xem `docs/api.md`.

Phần còn lại của site vẫn bắt buộc đăng nhập Windows. Bước 10 của script kiểm tra hai điều: trang chính qua IIS vào được bằng tài khoản
Windows, và `/inbox/api/v1/systems` gọi không kèm tài khoản trả **401 của ứng dụng** (không phải 401 của IIS).

> **Lưu ý cho phía kho (ngoài phạm vi bộ cài này):** lời gọi ngược từ hộp việc sang kho (`POST <baseUrl>/api/inbox/act`, ký HMAC) cũng là
> máy gọi máy. Nếu site IIS của kho tắt Anonymous cho toàn site thì kho cũng cần mở Anonymous riêng đường dẫn đó, nếu không IIS của kho chặn.

### 0.2 Chạy chung một tên miền với kho

Script tạo **site IIS riêng** (`Inbox`). Hai cách dùng chung máy chủ:
- Mỗi site một tên miền (`kho.fivestar.local`, `inbox.fivestar.local`) cùng cổng 80 — chạy `install.ps1` với `-HostName` khác nhau (khuyến nghị).
- Cùng một tên miền, hai tiền tố `/storage` và `/inbox` — cần gộp thành một site IIS (hai rule rewrite) và cho Anonymous ở cả `/inbox/api/v1` lẫn đường dẫn máy gọi máy của kho.
  Bộ cài không tự làm; phải sửa tay.

## A. Chuẩn bị (máy CÓ internet, làm một lần mỗi bản phát hành)

1. Mở PowerShell tại thư mục dự án, chạy:
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\build-release.ps1
   ```
   Hoặc nhấp đúp `deploy\build-release.cmd` (cùng tham số: `-SkipVendor`, `-DryRun`…). **Tắt `npm run dev` trước** (`npm ci` / build ghi đè `node_modules` và `.next`).
   Script: `npm ci` → `npm run build` (Next.js `output: "standalone"`, `.next/standalone` đã tự chứa `server.js`/`public/`/static, xem `scripts/post-build.mjs`)
   → thêm các gói mà script cài đặt (`scripts/*.mjs`) cần (drizzle-orm, pg, dotenv) → tải bộ cài vào `vendor\`
   (Node.js, NSSM, IIS URL Rewrite, IIS ARR; file `.msi` được kiểm tra chữ ký số) → nén `release\inbox-<ngày>-<commit>.zip`.
2. **Tự tải thêm PostgreSQL** (nếu máy chủ chưa có): bản Windows x64 của EDB (`postgresql-<ver>-windows-x64.exe`), bỏ vào
   `release\inbox-…\vendor\` **trước khi nén** (chạy lại với `-SkipBuild -SkipVendor` để chỉ nén lại), hoặc chép vào `vendor\` sau khi giải nén.
3. Nếu script cảnh báo "không tải được …" (nhà cung cấp đổi địa chỉ): tải tay file đó, đặt vào `vendor\` đúng tên in trong cảnh báo, chạy lại với `-SkipBuild`.
4. Chép file `.zip` sang máy chủ bằng USB / chia sẻ nội bộ.

Thử không thay đổi gì: thêm `-DryRun`.

## B. Cần có TRƯỚC khi cài (nhờ IT domain, chỉ làm một lần)

- [ ] Máy chủ Windows (Server 2016+ hoặc Windows 10/11 Pro) **đã join domain**; có ≥ 2 GB trống, ≥ 4 GB RAM.
- [ ] Bản ghi DNS cho tên miền nội bộ (VD `inbox.fivestar.local` → IP máy chủ).
- [ ] Trình duyệt người dùng coi site là **Intranet** (GPO "Site to Zone": thêm `http://inbox.fivestar.local`) để tự gửi tài khoản Windows, không hiện hộp mật khẩu.
- [ ] (Tùy chọn) Một tài khoản domain để tự kiểm tra sau khi cài, VD `fs-ota` (`-TestAccount`). Hệ thống không có bảng người dùng nên tài khoản nào cũng được.
- [ ] Chạy PowerShell bằng **Run as administrator**.

## C. Cài đặt (máy chủ)

1. Giải nén `.zip` vào nơi bất kỳ (VD `D:\setup\inbox-20261106-cc72363`).
2. Mở PowerShell **Run as administrator**:
   ```powershell
   cd D:\setup\inbox-20261106-cc72363
   Set-ExecutionPolicy -Scope Process Bypass
   .\deploy\install.ps1 -DryRun        # xem trước, không đổi gì (script hỏi các thông tin còn thiếu)
   .\deploy\install.ps1 -Domain FIVESTAR -TestAccount fs-ota -HostName inbox.fivestar.local
   ```
   Không truyền tham số thì script hỏi lần lượt. Khi hỏi mật khẩu `postgres`: đây là mật khẩu **đặt mới** nếu script cài PostgreSQL
   (hãy nhớ / cất kỹ), hoặc mật khẩu hiện có nếu PostgreSQL đã cài sẵn (dùng chung máy với kho thì đó là mật khẩu `postgres` của kho).
3. Script chạy 11 bước, mỗi bước in `OK` / `!!` (cần xem) và **dừng ngay khi lỗi** kèm "Cách xử lý". Log đầy đủ: `C:\apps\kujiraa-inbox-data\logs\install-*.log` (không chứa mật khẩu).
4. **Script chạy lại an toàn.** Sửa nguyên nhân rồi chạy lại đúng lệnh cũ: bước đã xong được bỏ qua, `.env` cũ giữ nguyên (mật khẩu DB, mã quản trị API, khóa ký không đổi). Không bao giờ xóa DB hay nhật ký.

| Bước | Việc | Nếu lỗi → xem |
|---|---|---|
| 1 | Kiểm tra quyền admin, ổ đĩa, cổng | F.1 |
| 2 | Cài Node.js (từ `vendor\`) | F.2 |
| 3 | Chép vào `C:\apps\kujiraa-inbox`, tạo thư mục log + `audit` | — |
| 4 | Cài / nhận PostgreSQL | F.3 |
| 5 | Sinh `.env` (mã quản trị API, khóa ký ngẫu nhiên, khóa file) | F.4 |
| 6 | Tạo DB `inbox` + migration | F.5 |
| 7 | Dịch vụ Windows `InboxServer` (NSSM) | F.6 |
| 8 | IIS: tính năng, URL Rewrite, ARR, site, `web.config`, Anonymous riêng `/inbox/api/v1` | F.7 |
| 9 | Tường lửa: mở cổng công khai (Node **không** mở) | — |
| 10 | Tự kiểm tra: header, DB, API không cần tài khoản Windows | G |

Tham số hay dùng: `-InstallDir`, `-DataDir` (log + nhật ký API, mặc định `C:\apps\kujiraa-inbox-data`), `-DbMode existing -DatabaseUrl …` (dùng PostgreSQL có sẵn),
`-HttpPort`, `-NodePort`, `-ServiceName`, `-SiteName`. Xem đầu file `deploy\install.ps1`.

## D. Sau khi cài

1. Mở `http://inbox.fivestar.local/inbox/viec-can-xu-ly` bằng máy trạm trong domain → vào thẳng trang Việc cần xử lý (danh sách trống tới khi có hệ thống nguồn gửi việc sang).
2. **Đăng ký hệ thống nguồn** (VD kho): `POST /inbox/api/v1/systems` với `Authorization: Bearer <INBOX_ADMIN_TOKEN>` (mã nằm trong `C:\apps\kujiraa-inbox\.env`, **không** in ra
   màn hình khi cài). Mã API của hệ thống chỉ hiện một lần. Chi tiết: [api.md](api.md).
   Địa chỉ gọi của hệ thống nguồn phải có tiền tố: `http://inbox.fivestar.local/inbox/api/v1/…`.
3. Sao lưu (xem mục E).

## E. Vận hành

**Log**: `C:\apps\kujiraa-inbox-data\logs\server.log`, `server-error.log` (tự xoay vòng 10 MB); IIS: `C:\inetpub\logs\LogFiles`.
**Nhật ký hoạt động API**: `C:\apps\kujiraa-inbox-data\audit\audit-YYYY-MM-DD.log` (`AUDIT_LOG_DIR`; không tự xóa file cũ).

**Dịch vụ**: `Restart-Service InboxServer` (sau khi sửa `.env`), `Get-Service InboxServer`.

**Sao lưu (hằng ngày)**:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U inbox -h localhost -Fc -f D:\backup\inbox-$(Get-Date -Format yyyyMMdd).dump inbox
robocopy C:\apps\kujiraa-inbox-data\audit D:\backup\inbox-audit /E
```
Cất thêm `C:\apps\kujiraa-inbox\.env` ở nơi an toàn: **mất `INBOX_SIGNING_KEY`** thì bí mật ký (action-secret) của từng hệ thống nguồn bị đổi, mọi nút xử lý trực tiếp ở hộp việc
bị từ chối cho tới khi cấp lại; mất `INBOX_ADMIN_TOKEN` thì tạo mã mới trong `.env` (không ảnh hưởng mã API của các hệ thống). Khôi phục:
`pg_restore -U inbox -h localhost -d inbox --clean <file>` (xóa dữ liệu hiện tại — làm khi đã chắc chắn).

**Nâng cấp phiên bản**: lặp A trên máy có mạng → chép zip mới sang → giải nén vào thư mục mới → chạy lại **cùng lệnh `install.ps1`**
(bản cũ được ghi đè, `.env` / DB giữ nguyên, migration mới tự chạy). Nên sao lưu trước.

**Gỡ**: `.\deploy\uninstall.ps1` (xóa dịch vụ, site IIS, cấu hình xác thực riêng, tường lửa; **giữ** DB, nhật ký, `.env`). `-DryRun` để xem trước.

## F. Làm tay từng bước (khi script dừng và chưa hiểu lỗi)

Mỗi mục là bước tương ứng của script. Chạy trong PowerShell **Run as administrator**.

**F.1 Kiểm tra** — cổng đang bị dùng: `netstat -ano | findstr :3001` (số cuối là PID → `tasklist /fi "pid eq <PID>"`).

**F.2 Node.js** — chạy `vendor\nodejs-x64.msi`, mở PowerShell **mới**, `node -v`.

**F.3 PostgreSQL** — chạy bộ cài EDB, nhớ mật khẩu `postgres`, cổng 5432. Dịch vụ `postgresql-x64-<ver>` phải `Running` (`services.msc`).

**F.4 `.env`** — tạo `C:\apps\kujiraa-inbox\.env` (mẫu: `.env.example`), tối thiểu:
```
DATABASE_URL="postgresql://inbox:<mật-khẩu-DB>@localhost:5432/inbox"
AUTH_AD_DOMAIN="fivestar"
PORT="3001"
HOSTNAME="127.0.0.1"
INBOX_ADMIN_TOKEN="<chuỗi ngẫu nhiên ≥ 32 ký tự>"
INBOX_SIGNING_KEY="<chuỗi ngẫu nhiên ≥ 32 ký tự>"
AUDIT_LOG_DIR="C:\apps\kujiraa-inbox-data\audit"
```
Sinh chuỗi ngẫu nhiên: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Tuyệt đối **không** đặt `ALLOW_USER_SWITCH`, `AUTH_TEST_LOGIN`, `DEV_ACCOUNT`, `TEST_LOGIN_CODE`.

**F.5 Database** (tại `C:\apps\kujiraa-inbox`):
```powershell
$env:PG_ADMIN_URL = "postgresql://postgres:<mật-khẩu-postgres>@localhost:5432/postgres"
$env:INBOX_DB_PASSWORD = "<mật-khẩu-DB>"
node scripts\create-db.mjs --db inbox --user inbox    # tạo role + DB (chạy lại an toàn)
Remove-Item Env:\PG_ADMIN_URL, Env:\INBOX_DB_PASSWORD
node scripts\migrate-prod.mjs                          # áp dụng migration (chạy lại an toàn)
```
Mật khẩu có ký tự đặc biệt trong `DATABASE_URL` phải mã hóa URL (`@` → `%40`, `:` → `%3A`, `/` → `%2F`).

**F.6 Dịch vụ**:
```powershell
cd C:\apps\kujiraa-inbox
.\tools\nssm.exe install InboxServer "C:\Program Files\nodejs\node.exe" server.js   # nssm.exe: giải nén từ vendor\nssm-2.24.zip (win64)
.\tools\nssm.exe set InboxServer AppDirectory C:\apps\kujiraa-inbox
.\tools\nssm.exe set InboxServer AppEnvironmentExtra NODE_ENV=production
.\tools\nssm.exe set InboxServer AppStdout C:\apps\kujiraa-inbox-data\logs\server.log
.\tools\nssm.exe set InboxServer AppStderr C:\apps\kujiraa-inbox-data\logs\server-error.log
.\tools\nssm.exe set InboxServer Start SERVICE_AUTO_START
Start-Service InboxServer
```
Thử riêng không qua dịch vụ để thấy lỗi ngay: `cd C:\apps\kujiraa-inbox; $env:NODE_ENV="production"; node server.js` (Ctrl+C để dừng).

**F.7 IIS**:
1. Bật tính năng: Server Manager → Add Roles and Features → **Web Server (IIS)** + *Security → Windows Authentication* (Windows 10/11: *Turn Windows features on or off → Internet Information Services → World Wide Web Services → Security → Windows Authentication*).
2. Cài `vendor\rewrite_amd64_en-US.msi` rồi `vendor\requestRouter_amd64.msi`. Mở lại IIS Manager.
3. IIS Manager → chọn **máy chủ** (nút gốc) → **Application Request Routing Cache** → *Server Proxy Settings* → tick **Enable proxy**; bỏ tick *Reverse rewrite host in response headers*. Giữ Host gốc (Next.js cần cho Server Actions) bằng PowerShell:
   ```powershell
   Import-Module WebAdministration
   Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name preserveHostHeader -Value $true
   Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name responseBufferLimit -Value 0
   ```
4. IIS Manager → máy chủ → **URL Rewrite** → *View Server Variables* → *Add*: `HTTP_X_REMOTE_USER`.
5. Tạo site: *Sites → Add Website*: tên `Inbox`, thư mục `C:\apps\kujiraa-inbox\iis`, binding `http`, cổng 80, host name `inbox.fivestar.local`. Application pool: **No Managed Code**.
6. Tạo `C:\apps\kujiraa-inbox\iis\web.config` từ `deploy\iis\web.config.template`: thay `__PORT__` (= `PORT` trong `.env`).
7. Site `Inbox` → **Authentication**: **Windows Authentication = Enabled**, **Anonymous Authentication = Disabled**. **Rồi riêng đường dẫn API cho Anonymous** (mục 0.1):
   ```powershell
   New-Item -ItemType Directory -Force C:\apps\kujiraa-inbox\iis\inbox\api\v1 | Out-Null
   Import-Module WebAdministration
   $a = "system.webServer/security/authentication"
   Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Location "Inbox/inbox/api/v1" -Filter "$a/anonymousAuthentication" -Name enabled -Value $true
   Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Location "Inbox/inbox/api/v1" -Filter "$a/windowsAuthentication" -Name enabled -Value $false
   ```
   Hoặc bằng IIS Manager: mở rộng site `Inbox` → thư mục `inbox\api\v1` → **Authentication** → Anonymous = Enabled, Windows Authentication = Disabled.
   Cách khác nếu lệnh trên lỗi: `& "$env:windir\System32\inetsrv\appcmd.exe" set config "Inbox/inbox/api/v1" -section:system.webServer/security/authentication/anonymousAuthentication /enabled:true /commit:apphost` (và `windowsAuthentication /enabled:false`).
8. Tường lửa: `New-NetFirewallRule -DisplayName "Inbox TCP 80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Domain,Private`. **Không** mở cổng Node (3001).

## G. Sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp → cách xử lý |
|---|---|
| Script: "cần quyền Administrator" | Mở PowerShell bằng *Run as administrator*. |
| Script: "running scripts is disabled" | `Set-ExecutionPolicy -Scope Process Bypass` rồi chạy lại trong **cùng** cửa sổ. |
| Chữ tiếng Việt trong script hiện lỗi font | Chỉ ảnh hưởng hiển thị (cửa sổ cũ). Dùng Windows Terminal / PowerShell mới; log ghi UTF-8. |
| Migration lỗi `permission denied` | DB chưa tạo bằng `create-db.mjs` (cần quyền `postgres`) → chạy F.5 với mật khẩu `postgres`. |
| `ECONNREFUSED 5432` | PostgreSQL chưa chạy: `Start-Service postgresql-x64-*`; sai cổng trong `DATABASE_URL`. |
| Trình duyệt hiện hộp hỏi mật khẩu | Site chưa ở vùng Intranet (mục B) hoặc dùng tên miền khác tên binding IIS. |
| Vào được nhưng trang "Không có quyền truy cập" | IIS không đặt đúng server variable `HTTP_X_REMOTE_USER` (sai tên, hoặc còn cấu hình `x-windows-user` kiểu cũ) → middleware không thấy header `x-remote-user`; hoặc `AUTH_AD_DOMAIN` khác `DOMAIN\` thật. Kiểm tra `deploy\iis\web.config.template`, F.7 bước 4, `iisreset` sau khi sửa. |
| Vào được nhưng danh sách việc luôn trống | Bình thường nếu chưa có hệ thống nguồn gửi việc, hoặc việc giao cho tài khoản khác (mỗi người chỉ thấy `assignee_account` của mình, chữ thường, không kèm domain). |
| Hệ thống nguồn (kho) gọi `/inbox/api/v1/...` bị 401 kèm `WWW-Authenticate: Negotiate` | IIS đang đòi Windows Authentication ở đường dẫn API → thiếu Anonymous riêng (F.7 bước 7). Bước 10 của script cũng cảnh báo trường hợp này. |
| Hệ thống nguồn gọi API bị 404 | Quên tiền tố `/inbox` trong địa chỉ (`http://…/inbox/api/v1/…`), hoặc ARR proxy chưa bật. |
| Hệ thống nguồn gọi API bị 401 từ ứng dụng | Sai / thiếu mã Bearer (mã API của hệ thống chỉ hiện một lần lúc đăng ký — xoay mã: `docs/api.md`). |
| IIS 500.19 / 500.50 khi mở site | URL Rewrite chưa cài, hoặc server variable chưa được phép (F.7 bước 4: *allowedServerVariables*). Cài lại / thêm biến; `iisreset`. |
| IIS 502 / 503 | Node chưa chạy (`Get-Service InboxServer`, xem `server-error.log`), hoặc `__PORT__` trong `web.config` khác `PORT` trong `.env`. |
| IIS 404 ở mọi trang | ARR proxy chưa bật (F.7 bước 3) hoặc rule `InboxProxy` không nằm trong `web.config` của site; hoặc mở `/` thay vì `/inbox/…` (ứng dụng chỉ phục vụ dưới `/inbox`). |
| IIS 413 / 404.13 khi hệ thống nguồn gửi payload lớn | `maxAllowedContentLength` trong `web.config` (mặc định 1 MB; API giới hạn thân yêu cầu 256 KB). |
| Sau khi sửa `.env` không đổi gì | `Restart-Service InboxServer`. |

**Quan trọng:** không có mã bí mật giữa IIS và Node — ứng dụng tin trực tiếp header `x-remote-user`. Bất kỳ ai gọi
thẳng tới `127.0.0.1:3001` (từ chính máy chủ, ví dụ qua `curl`) đều có thể giả mạo tài khoản bất kỳ. Đây là đánh đổi đã chọn (cùng cách với hệ thống kho,
không cần đồng bộ secret giữa `.env` và `web.config`); an toàn hoàn toàn dựa vào việc **không ai ngoài quản trị viên có quyền chạy mã trên máy chủ này**,
và Node chỉ nghe loopback nên không ai từ máy khác gọi thẳng vào được:
```powershell
curl.exe -s -H "x-remote-user: FIVESTAR\fs-ota" http://127.0.0.1:3001/inbox/viec-can-xu-ly   # vào được — không phải lỗ hổng, là thiết kế
curl.exe -s http://127.0.0.1:3001/inbox/viec-can-xu-ly                                        # không có header -> "Không có quyền truy cập"
```
Hệ quả riêng của hộp việc: vì không có bảng người dùng, người giả mạo `x-remote-user` xem được việc của chính tài khoản đó (không hơn).

## H. Những gì chưa được kiểm chứng (đọc kỹ)

- Các script ở đây được viết bằng cách chép bộ cài của kho rồi sửa; **mới được kiểm tra cú pháp** (`Parser.ParseFile` cho `.ps1`, `node --check` cho `.mjs`) và chạy thử `build-release.ps1 -DryRun`.
  `install.ps1 -DryRun` **chưa chạy** (cần quyền Administrator).
- Phần **Windows** của `install.ps1` (cài Node / PostgreSQL / NSSM / URL Rewrite / ARR, bật tính năng IIS, tạo site, đặt Windows Authentication, tường lửa) **chưa chạy thật**
  (máy phát triển không có IIS và không join domain). Lần cài thật đầu tiên nên có người kiểm tra; nếu một bước IIS thất bại, dùng mục F.7 làm tay rồi chạy lại script.
- **Cấu hình Anonymous riêng `/inbox/api/v1` là phần rủi ro nhất chưa kiểm chứng:** việc `Set-WebConfigurationProperty -Location "Inbox/inbox/api/v1"` ghi đúng vào `applicationHost.config`,
  và IIS cho lọt yêu cầu ẩn danh qua rule rewrite sang Node, chưa thử trên IIS thật. Bước 10 của script tự kiểm tra kết quả (cảnh báo nếu IIS vẫn đòi Windows Authentication).
- Chưa kiểm chứng đầu-cuối: kho gọi sang hộp việc qua IIS với tiền tố `/inbox`.
- Địa chỉ tải bộ cài trong `build-release.ps1` lấy từ trang phát hành công khai của nhà cung cấp; nếu đổi, script chỉ cảnh báo (mục A.3).
- Bộ cài giả định phần ứng dụng đã được chuyển sang kiểu của kho: `basePath` `/inbox`, `output: "standalone"`, `scripts/post-build.mjs`, header `x-remote-user`, bỏ SSPI/`server.js` riêng.
  Nếu các thay đổi đó chưa có thì bản build ra sẽ không khớp với bộ cài (không có `.next\standalone\server.js`, địa chỉ không có tiền tố `/inbox`…).
