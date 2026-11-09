<#
.SYNOPSIS
  Cài đặt "Việc cần xử lý" (inbox) từ A-Z trên máy chủ Windows KHÔNG có internet. Chạy bằng PowerShell "Run as administrator".

.DESCRIPTION
  Chạy từ thư mục đã giải nén bản phát hành (tạo bởi deploy\build-release.ps1). Script CHẠY LẠI AN TOÀN (idempotent): bước nào đã xong
  thì bỏ qua; .env cũ được giữ (không đổi mật khẩu DB, mã quản trị API, khóa ký). Không bao giờ xóa DB hay nhật ký hoạt động.
  Các bước: kiểm tra máy → Node.js → sao chép → PostgreSQL → file cấu hình .env → DB + migration →
            dịch vụ Windows (NSSM) → IIS → tường lửa → kiểm tra tự động → tổng kết.
  Hệ thống này có DB RIÊNG (không dùng chung với kho) và KHÔNG có bảng người dùng: ai xác thực được ở IIS thì vào được,
  chỉ thấy việc có assignee_account trùng tài khoản của mình.
  Toàn bộ log lưu ở <thư mục dữ liệu>\logs\install-<thời gian>.log. Không ghi mật khẩu vào log / màn hình.

.PARAMETER Domain        Domain AD, VD FIVESTAR (ghi vào AUTH_AD_DOMAIN).
.PARAMETER TestAccount   (Tùy chọn) Tài khoản domain dùng để tự kiểm tra sau khi cài, VD fs-ota (không kèm domain). Hệ thống này không có
                         bảng người dùng nên tài khoản nào cũng được; bỏ trống = bỏ qua bước kiểm tra có đăng nhập.
.PARAMETER InstallDir    Thư mục cài đặt (mặc định C:\apps\kujiraa-inbox). Nếu khác thư mục hiện tại, bản phát hành được sao chép sang đó.
.PARAMETER DataDir       Nơi lưu log cài đặt / dịch vụ và nhật ký hoạt động API (mặc định C:\apps\kujiraa-inbox-data).
.PARAMETER DbMode        local = cài/dùng PostgreSQL trên chính máy này (mặc định). existing = dùng PostgreSQL có sẵn (kèm -DatabaseUrl).
.PARAMETER DatabaseUrl   Chuỗi kết nối khi -DbMode existing (DB và tài khoản phải tạo sẵn).
.PARAMETER HostName      Tên miền nội bộ của site IIS (VD inbox.fivestar.local). Bỏ trống = site nghe mọi tên ở cổng HttpPort.
.PARAMETER HttpPort      Cổng công khai của IIS (mặc định 80).
.PARAMETER NodePort      Cổng Node nội bộ (mặc định 3001, chỉ nghe 127.0.0.1).
.PARAMETER ServiceName   Tên dịch vụ Windows (mặc định InboxServer).
.PARAMETER SiteName      Tên site IIS (mặc định Inbox).
.PARAMETER DryRun        Chỉ in việc SẼ làm, không thay đổi gì trên máy.
.PARAMETER Yes           Không hỏi xác nhận trước khi bắt đầu (dùng khi chạy tự động).

.EXAMPLE
  .\deploy\install.ps1 -Domain FIVESTAR -TestAccount fs-ota -HostName inbox.fivestar.local
.EXAMPLE
  .\deploy\install.ps1 -DryRun          # xem trước, thiếu thông tin script sẽ hỏi
#>
[CmdletBinding()]
param(
  [string]$Domain,
  [string]$TestAccount,
  [string]$InstallDir = "C:\apps\kujiraa-inbox",
  [string]$DataDir = "C:\apps\kujiraa-inbox-data",
  [ValidateSet("local", "existing")][string]$DbMode = "local",
  [string]$DatabaseUrl,
  [string]$HostName = "",
  [int]$HttpPort = 0,
  [int]$NodePort = 3001,
  [string]$ServiceName = "InboxServer",
  [string]$SiteName = "Inbox",
  [switch]$DryRun,
  [switch]$Yes
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2

$Release = Split-Path -Parent $PSScriptRoot
$Steps = @{ Done = @(); Warn = @() }
$Log = $null
# Tiền tố đường dẫn của app — phải khớp BASE_PATH trong lib/base-path.ts (basePath của Next.js: không có trang nào
# ngoài tiền tố này, kể cả "/").
$BasePath = "/inbox"
# API máy gọi máy cho hệ thống nguồn (mã Bearer, không có người dùng Windows) — IIS phải cho Anonymous riêng đường dẫn này
$ApiPath = $BasePath.Trim("/") + "/api/v1"

# ---------- tiện ích ----------
function Say($m, $color = "Gray") { Write-Host $m -ForegroundColor $color }
function Step($n, $m) { Say "`n[$n] $m" "Cyan" }
function Ok($m) { Say "   OK  $m" "Green"; $Steps.Done += $m }
function Warn($m) { Say "   !!  $m" "Yellow"; $Steps.Warn += $m }
function Die($m, $hint) {
  Say "`nLỖI: $m" "Red"
  if ($hint) { Say "Cách xử lý: $hint" "Yellow" }
  if ($Log) { Say "Log chi tiết: $Log" "Yellow" }
  try { Stop-Transcript | Out-Null } catch { }
  exit 1
}
function Do-It($desc, [scriptblock]$sb) {
  if ($DryRun) { Say "   [DRY-RUN] $desc" "Yellow"; return }
  Say "   -> $desc"
  & $sb
}
function Native($exe, [string[]]$arguments, $what, $hint) {
  # chạy chương trình ngoài, dừng nếu lỗi (không in tham số: có thể chứa mật khẩu)
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { Die "$what thất bại (mã $LASTEXITCODE)." $hint }
}
function Ask($prompt, $default) {
  if ($Yes) { return $default }
  $s = if ($default) { "$prompt [$default]" } else { $prompt }
  $v = Read-Host $s
  if ([string]::IsNullOrWhiteSpace($v)) { return $default }
  return $v.Trim()
}
function AskSecret($prompt) {
  $s = Read-Host $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function New-Secret($bytes = 32) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}
function Is-Server { return (Get-CimInstance Win32_OperatingSystem).ProductType -ne 1 }
function Port-InUse($p) { return [bool](Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) }
function Find-Vendor($pattern) { $d = Join-Path $Release "vendor"; if (Test-Path $d) { return Get-ChildItem $d -Filter $pattern -ErrorAction SilentlyContinue | Select-Object -First 1 } }

# Gọi HTTP một lần, trả mã trạng thái (-1 = không kết nối được) và header WWW-Authenticate (để biết IIS hay ứng dụng từ chối)
function Probe($url, $headers, [switch]$WindowsCredentials) {
  $p = @{ Uri = $url; Headers = $headers; UseBasicParsing = $true; MaximumRedirection = 0; TimeoutSec = 60 }
  if ($WindowsCredentials) { $p.UseDefaultCredentials = $true }
  try {
    $r = Invoke-WebRequest @p
    return @{ Code = [int]$r.StatusCode; Auth = "" }
  } catch {
    $resp = $null
    if ($_.Exception.PSObject.Properties["Response"]) { $resp = $_.Exception.Response }
    if (-not $resp) { return @{ Code = -1; Auth = "" } }
    return @{ Code = [int]$resp.StatusCode; Auth = [string]$resp.Headers["WWW-Authenticate"] }
  }
}

# Đọc / ghi .env (giữ nguyên giá trị đã có, chỉ thêm khóa còn thiếu)
function Read-EnvFile($path) {
  $h = [ordered]@{}
  if (Test-Path $path) {
    foreach ($line in [IO.File]::ReadAllLines($path)) {
      $l = $line.TrimStart([char]0xFEFF)
      if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $h[$Matches[1]] = $Matches[2].Trim().Trim('"') }
    }
  }
  return $h
}
function Write-EnvFile($path, $h, $header) {
  $lines = @($header) + ($h.GetEnumerator() | ForEach-Object { "{0}=`"{1}`"" -f $_.Key, $_.Value })
  [IO.File]::WriteAllText($path, (($lines -join "`r`n") + "`r`n"), (New-Object Text.UTF8Encoding($false)))
}
function Lock-Acl($path, $extraAccount) {
  # chỉ SYSTEM + Administrators (+ tài khoản chạy dịch vụ) được đọc file chứa bí mật
  $grants = @("*S-1-5-18:(F)", "*S-1-5-32-544:(F)")
  if ($extraAccount) { $grants += "${extraAccount}:(R)" }
  & icacls.exe $path /inheritance:r | Out-Null
  foreach ($g in $grants) { & icacls.exe $path /grant:r $g | Out-Null }
  if ($LASTEXITCODE -ne 0) { Warn "Không đặt được quyền truy cập file $path — tự kiểm tra bằng 'icacls $path'." }
}

# ---------- 0. mở đầu ----------
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Say "LỖI: cần quyền Administrator." "Red"
  Say "Cách xử lý: bấm phải PowerShell → 'Run as administrator', rồi chạy lại." "Yellow"
  exit 1
}
if (-not (Test-Path (Join-Path $Release "server.js")) -or -not (Test-Path (Join-Path $Release ".next\BUILD_ID"))) {
  Say "LỖI: không thấy server.js / .next trong $Release — chạy script này từ thư mục bản phát hành đã giải nén (deploy\install.ps1)." "Red"
  exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "logs") | Out-Null
$Log = Join-Path $DataDir ("logs\install-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $Log | Out-Null
Say "=== CÀI ĐẶT VIỆC CẦN XỬ LÝ (INBOX) ===" "Cyan"
if ($DryRun) { Say "CHẾ ĐỘ XEM TRƯỚC (-DryRun): không thay đổi gì trên máy." "Yellow" }
Say "Bản phát hành: $Release"
if (Test-Path (Join-Path $Release "release.json")) { Say ("Phiên bản: " + ((Get-Content (Join-Path $Release "release.json") -Raw | ConvertFrom-Json).name)) }

# hỏi thông tin còn thiếu
if (-not $Domain) { $Domain = Ask "Domain AD (VD FIVESTAR)" "" }
if (-not $Domain) { Die "Thiếu domain AD." "Chạy lại với -Domain FIVESTAR." }
if (-not $TestAccount) { $TestAccount = Ask "Tài khoản domain để tự kiểm tra sau khi cài (không kèm domain, VD fs-ota; bỏ trống = bỏ qua)" "" }
if ($TestAccount -and $TestAccount -notmatch '^[A-Za-z0-9._-]{1,64}$') { Die "Tài khoản kiểm tra '$TestAccount' không hợp lệ." "Chỉ gồm chữ, số, . _ - (không kèm 'DOMAIN\')." }
if ($HttpPort -le 0) { $HttpPort = 80 }
if (-not $HostName) { $HostName = Ask "Tên miền nội bộ của site (VD inbox.fivestar.local; bỏ trống = mọi tên)" "" }
$AppPort = $NodePort
if ($NodePort -eq $HttpPort) { Die "NodePort và HttpPort trùng ($NodePort)." "Đổi một trong hai (NodePort mặc định 3001, HttpPort 80)." }
if ($DbMode -eq "existing" -and -not $DatabaseUrl) { Die "-DbMode existing cần -DatabaseUrl." "VD: -DatabaseUrl postgresql://inbox:matkhau@10.0.0.5:5432/inbox" }

Say "`nSẽ cài với cấu hình:" "White"
Say "  Domain         : $Domain"
Say "  Thư mục cài    : $InstallDir   Dữ liệu / log: $DataDir"
Say "  Cổng           : công khai $HttpPort, Node nội bộ 127.0.0.1:$NodePort$(if ($HostName) { "   Tên miền: $HostName" })"
Say "  Database       : $DbMode      Dịch vụ: $ServiceName   Site IIS: $SiteName"
Say "  Tài khoản kiểm tra : $(if ($TestAccount) { "$Domain\$TestAccount" } else { '(bỏ qua)' })"
if (-not $Yes -and -not $DryRun) { if ((Read-Host "`nTiếp tục? (gõ Y để chạy)") -notmatch '^[Yy]') { Say "Đã hủy."; Stop-Transcript | Out-Null; exit 0 } }

# ---------- 1. kiểm tra máy ----------
Step "1/11" "Kiểm tra máy chủ"
$os = Get-CimInstance Win32_OperatingSystem
Ok "Windows: $($os.Caption) $($os.Version) — PowerShell $($PSVersionTable.PSVersion)"
if ($PSVersionTable.PSVersion.Major -lt 5) { Die "Cần PowerShell 5.1 trở lên." "Cài Windows Management Framework 5.1." }
$drive = Split-Path -Qualifier $InstallDir
$free = [math]::Round((Get-PSDrive ($drive.TrimEnd(":"))).Free / 1GB, 1)
if ($free -lt 2) { Die "Ổ $drive chỉ còn $free GB trống." "Giải phóng ít nhất 2 GB." } else { Ok "Ổ $drive còn $free GB trống" }
$busy = if (Get-Service $ServiceName -ErrorAction SilentlyContinue) { $null } else { $AppPort }
if ($busy -and (Port-InUse $busy)) { Die "Cổng $busy đang bị chương trình khác dùng." "Xem: netstat -ano | findstr :$busy ; hoặc chạy lại với -NodePort/-HttpPort khác." }
Ok "Cổng $AppPort còn trống (hoặc do dịch vụ $ServiceName đang dùng)"

# ---------- 2. Node.js ----------
Step "2/11" "Node.js"
$node = (Get-Command node -ErrorAction SilentlyContinue)
if ($node) { Ok "Đã có Node $(& node -v) tại $($node.Source)" } else {
  $msi = Find-Vendor "nodejs*.msi"
  if (-not $msi) { Die "Chưa cài Node.js và không có bộ cài trong vendor\." "Copy node-vXX-x64.msi (cùng phiên bản dùng khi build) vào $Release\vendor\ rồi chạy lại." }
  Do-It "Cài $($msi.Name)" { $p = Start-Process msiexec.exe -ArgumentList "/i `"$($msi.FullName)`" /qn /norestart" -Wait -PassThru; if ($p.ExitCode -notin 0, 3010) { Die "Cài Node.js thất bại (mã $($p.ExitCode))." "Chạy tay file $($msi.Name) để xem lỗi." } }
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $DryRun -and -not (Get-Command node -ErrorAction SilentlyContinue)) { Die "Đã cài Node nhưng chưa thấy lệnh node." "Mở PowerShell Administrator MỚI rồi chạy lại script." }
  Ok "Đã cài Node.js"
}
$NodeExe = if ($DryRun -and -not (Get-Command node -ErrorAction SilentlyContinue)) { "C:\Program Files\nodejs\node.exe" } else { (Get-Command node).Source }

# ---------- 3. sao chép bản phát hành ----------
Step "3/11" "Sao chép vào $InstallDir"
$same = (Resolve-Path -LiteralPath $Release).Path.TrimEnd("\") -ieq $InstallDir.TrimEnd("\")
if ($same) { Ok "Đang chạy ngay trong thư mục cài — không cần sao chép" } else {
  if (Get-Service $ServiceName -ErrorAction SilentlyContinue) { Do-It "Dừng dịch vụ $ServiceName để cập nhật file" { Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue } }
  # /E sao chép đè, KHÔNG dùng /MIR nên không xóa file lạ (.env cũ). Loại .env của bản phát hành (không có), giữ .env đang dùng.
  Do-It "robocopy bản phát hành → $InstallDir" {
    & robocopy.exe $Release $InstallDir /E /XF ".env" /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Die "Sao chép thất bại (robocopy mã $LASTEXITCODE)." "Kiểm tra quyền ghi / dung lượng ổ cài đặt, file đang bị khóa." }
  }
  Ok "Đã sao chép bản phát hành"
}
$App = if ($same) { $Release } else { $InstallDir }
Do-It "Tạo thư mục log và nhật ký hoạt động" {
  New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "logs") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "audit") | Out-Null
}

# ---------- 4. PostgreSQL ----------
Step "4/11" "PostgreSQL"
$pgPass = $null
$pgSvc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
$pgPort = 5432
if ($DbMode -eq "existing") { Ok "Dùng PostgreSQL có sẵn qua -DatabaseUrl (bỏ qua cài đặt và tạo DB)" }
elseif ($pgSvc) { Ok "Đã có dịch vụ PostgreSQL: $($pgSvc.Name) ($($pgSvc.Status))" }
else {
  $pgInst = Find-Vendor "postgresql-*.exe"
  if (-not $pgInst) { Die "Máy chưa có PostgreSQL và không có bộ cài trong vendor\." "Copy postgresql-<phiên bản>-windows-x64.exe (EDB) vào $Release\vendor\ rồi chạy lại. Hoặc dùng -DbMode existing -DatabaseUrl ..." }
  $pgPass = if ($DryRun) { "dry-run" } else { AskSecret "Đặt mật khẩu cho tài khoản quản trị PostgreSQL 'postgres' (nhớ giữ lại)" }
  if (-not $DryRun -and $pgPass.Length -lt 8) { Die "Mật khẩu quá ngắn (cần ≥ 8 ký tự)." "Chạy lại và đặt mật khẩu dài hơn." }
  Do-It "Cài $($pgInst.Name) (mất vài phút)" {
    Native $pgInst.FullName @("--mode", "unattended", "--unattendedmodeui", "none", "--superpassword", $pgPass, "--serverport", "$pgPort") "Cài PostgreSQL" "Chạy tay file $($pgInst.Name) để xem lỗi (có thể thiếu Visual C++ Redistributable)."
  }
  $pgSvc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $DryRun -and -not $pgSvc) { Die "Cài xong nhưng không thấy dịch vụ PostgreSQL." "Xem log cài đặt PostgreSQL trong %TEMP%\install-postgresql.log." }
  Ok "Đã cài PostgreSQL"
}
if ($pgSvc -and $pgSvc.Status -ne "Running" -and -not $DryRun) { Start-Service $pgSvc.Name; Ok "Đã khởi động $($pgSvc.Name)" }

# ---------- 5. file cấu hình .env ----------
Step "5/11" "File cấu hình .env"
$envPath = Join-Path $App ".env"
$cfg = Read-EnvFile $envPath
$firstInstall = -not $cfg.Contains("DATABASE_URL")
$dbName = "inbox"; $dbUser = "inbox"
$dbPassNew = $null
if ($firstInstall) {
  if ($DbMode -eq "existing") { $cfg["DATABASE_URL"] = $DatabaseUrl }
  else { $dbPassNew = New-Secret 18; $cfg["DATABASE_URL"] = "postgresql://${dbUser}:$([uri]::EscapeDataString($dbPassNew))@localhost:${pgPort}/${dbName}" }
}
$cfg["AUTH_AD_DOMAIN"] = $Domain.ToLower()
$cfg["PORT"] = "$AppPort"
# Mã quản trị API (đăng ký hệ thống nguồn) và khóa ký (suy ra bí mật ký lời gọi sang hệ thống nguồn): sinh một lần, KHÔNG đổi ở lần chạy lại —
# đổi INBOX_SIGNING_KEY làm mọi hệ thống nguồn đã đăng ký từ chối chữ ký cho tới khi đổi lại action-secret
if (-not $cfg.Contains("INBOX_ADMIN_TOKEN")) { $cfg["INBOX_ADMIN_TOKEN"] = New-Secret 32 }
if (-not $cfg.Contains("INBOX_SIGNING_KEY")) { $cfg["INBOX_SIGNING_KEY"] = New-Secret 32 }
# Nhật ký hoạt động API nằm ngoài thư mục cài (không bị mất khi cập nhật / gỡ)
if (-not $cfg.Contains("AUDIT_LOG_DIR")) { $cfg["AUDIT_LOG_DIR"] = (Join-Path $DataDir "audit") }
$cfg["HOSTNAME"] = "127.0.0.1"
$cfg.Remove("HOST") # biến cũ của server.js custom (đã bỏ) — server.js do Next tự sinh đọc HOSTNAME
foreach ($bad in "AUTH_TEST_LOGIN", "ALLOW_USER_SWITCH", "DEV_ACCOUNT", "TEST_LOGIN_CODE", "SSO_ENABLED", "SSO_MODE", "SSO_PROXY", "SSO_PROXY_SECRET") {
  if ($cfg.Contains($bad)) { Warn "Gỡ $bad khỏi .env (không dùng trên máy chủ thật)"; $cfg.Remove($bad) }
}
Do-It "Ghi $envPath (không BOM, hạn chế quyền đọc)" {
  Write-EnvFile $envPath $cfg "# Tạo bởi deploy/install.ps1 — CHỨA BÍ MẬT, không chia sẻ / không đưa vào git. Sửa tay rồi restart dịch vụ $ServiceName."
  Lock-Acl $envPath $null
}
Ok ".env sẵn sàng$(if (-not $firstInstall) { ' (giữ giá trị cũ của DATABASE_URL, INBOX_ADMIN_TOKEN, INBOX_SIGNING_KEY)' })"

# ---------- 6. tạo DB + migration ----------
Step "6/11" "Database và migration"
if (-not $DryRun) { Push-Location $App }
try {
  if ($DbMode -eq "local" -and $firstInstall) {
    if (-not $pgPass -and -not $DryRun) { $pgPass = AskSecret "Mật khẩu tài khoản 'postgres' của PostgreSQL trên máy này" }
    $env:PG_ADMIN_URL = "postgresql://postgres:$([uri]::EscapeDataString([string]$pgPass))@localhost:${pgPort}/postgres"
    $env:INBOX_DB_PASSWORD = $dbPassNew
    try {
      Do-It "Tạo tài khoản + database '$dbName'" {
        Native $NodeExe @("scripts\create-db.mjs", "--db", $dbName, "--user", $dbUser) "Tạo database" "Kiểm tra mật khẩu 'postgres' và dịch vụ PostgreSQL đang chạy (services.msc)."
      }
    } finally { Remove-Item Env:\PG_ADMIN_URL, Env:\INBOX_DB_PASSWORD -ErrorAction SilentlyContinue }
  } else { Ok "Bỏ qua tạo DB (đã có hoặc dùng DB ngoài)" }
  Do-It "Áp dụng migration (an toàn chạy lại)" { Native $NodeExe @("scripts\migrate-prod.mjs") "Migration" "Đọc thông báo lỗi phía trên; kiểm tra DATABASE_URL trong $envPath." }
  Ok "Database đã ở phiên bản mới nhất"
} finally { if (-not $DryRun) { Pop-Location } }

# ---------- 7. dịch vụ Windows ----------
Step "7/11" "Dịch vụ Windows ($ServiceName) bằng NSSM"
$nssm = Join-Path $App "tools\nssm.exe"
if (-not (Test-Path $nssm)) {
  $zip = Find-Vendor "nssm*.zip"
  if (-not $zip) { Die "Không có NSSM (vendor\nssm-*.zip)." "Tải nssm-2.24.zip từ nssm.cc trên máy có mạng, bỏ vào $Release\vendor\ rồi chạy lại." }
  Do-It "Giải nén NSSM" {
    $tmp = Join-Path $env:TEMP "nssm-extract"; Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $tmp -Force
    $exe = Get-ChildItem $tmp -Recurse -Filter nssm.exe | Where-Object { $_.FullName -match "win64" } | Select-Object -First 1
    if (-not $exe) { Die "Không tìm thấy win64\nssm.exe trong $($zip.Name)." "Dùng bản nssm-2.24.zip chính thức." }
    New-Item -ItemType Directory -Force -Path (Split-Path $nssm) | Out-Null
    Copy-Item $exe.FullName $nssm -Force
  }
}
$logDir = Join-Path $DataDir "logs"
$exists = [bool](Get-Service $ServiceName -ErrorAction SilentlyContinue)
Do-It "$(if ($exists) { 'Cập nhật' } else { 'Tạo' }) dịch vụ $ServiceName" {
  if (-not $exists) { Native $nssm @("install", $ServiceName, $NodeExe, "server.js") "Tạo dịch vụ" "Chạy lại; nếu lỗi, xem 'sc query $ServiceName'." }
  $set = @{
    Application = $NodeExe; AppParameters = "server.js"; AppDirectory = $App
    AppEnvironmentExtra = "NODE_ENV=production"; Start = "SERVICE_AUTO_START"
    AppStdout = (Join-Path $logDir "server.log"); AppStderr = (Join-Path $logDir "server-error.log")
    AppRotateFiles = "1"; AppRotateBytes = "10485760"; AppExit = "Default Restart"; AppRestartDelay = "5000"
  }
  foreach ($k in $set.Keys) { Native $nssm @("set", $ServiceName, $k, $set[$k]) "nssm set $k" "Xem 'tools\nssm.exe dump $ServiceName'." }
  Start-Service $ServiceName -ErrorAction SilentlyContinue
  if ((Get-Service $ServiceName).Status -ne "Running") { Restart-Service $ServiceName -ErrorAction SilentlyContinue }
}
Ok "Dịch vụ $ServiceName (tự chạy khi bật máy, tự khởi động lại khi lỗi). Log: $logDir\server*.log"

# ---------- 8. IIS ----------
Step "8/11" "IIS"
$serverFeatures = @("Web-Server", "Web-Common-Http", "Web-Static-Content", "Web-Default-Doc", "Web-Http-Errors", "Web-Filtering", "Web-Windows-Auth", "Web-Mgmt-Console", "Web-Http-Logging")
$clientFeatures = @("IIS-WebServerRole", "IIS-WebServer", "IIS-CommonHttpFeatures", "IIS-StaticContent", "IIS-DefaultDocument", "IIS-HttpErrors", "IIS-RequestFiltering", "IIS-WindowsAuthentication", "IIS-ManagementConsole", "IIS-HttpLogging")
Do-It "Bật các tính năng IIS (Windows Authentication, ...) — dùng nguồn của Windows, cần đĩa cài nếu máy chưa có sẵn" {
  if (Is-Server) {
    $r = Install-WindowsFeature -Name $serverFeatures -ErrorAction Stop
    if (-not $r.Success) { Die "Cài tính năng IIS thất bại." "Mở Server Manager → Add Roles and Features, bật Web Server + Windows Authentication, rồi chạy lại." }
  } else {
    foreach ($f in $clientFeatures) { Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart -ErrorAction Stop | Out-Null }
  }
}
Ok "Tính năng IIS sẵn sàng"
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (-not $DryRun -and -not (Get-Module WebAdministration)) { Die "Không nạp được module WebAdministration." "Mở PowerShell Administrator MỚI (sau khi bật IIS) rồi chạy lại script." }

foreach ($m in @(@{ Pat = "rewrite_amd64*.msi"; Key = "URL Rewrite"; Test = "$env:windir\System32\inetsrv\rewrite.dll" }, @{ Pat = "requestRouter_amd64*.msi"; Key = "ARR"; Test = "$env:ProgramFiles\IIS\Application Request Routing\requestRouter.dll" })) {
  if (Test-Path $m.Test) { Ok "$($m.Key) đã cài"; continue }
  $msi = Find-Vendor $m.Pat
  if (-not $msi) { Die "Chưa cài IIS $($m.Key) và không có bộ cài trong vendor\." "Tải $($m.Pat) từ Microsoft trên máy có mạng, bỏ vào $Release\vendor\ rồi chạy lại." }
  Do-It "Cài $($msi.Name)" {
    $sig = Get-AuthenticodeSignature $msi.FullName
    if ($sig.Status -ne "Valid") { Die "Chữ ký số của $($msi.Name) không hợp lệ ($($sig.Status))." "Tải lại file gốc từ Microsoft; không cài file không rõ nguồn." }
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$($msi.FullName)`" /qn /norestart" -Wait -PassThru
    if ($p.ExitCode -notin 0, 3010) { Die "Cài $($m.Key) thất bại (mã $($p.ExitCode))." "Chạy tay file $($msi.Name) để xem lỗi." }
  }
  Ok "Đã cài $($m.Key)"
}

# cấu hình mức máy chủ: ARR proxy + biến server được phép
Do-It "Bật ARR proxy và cho phép biến HTTP_X_REMOTE_USER" {
  Import-Module WebAdministration
  $apphost = "MACHINE/WEBROOT/APPHOST"
  Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "enabled" -Value $true
  Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "preserveHostHeader" -Value $true
  Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "reverseRewriteHostInResponseHeaders" -Value $false
  Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "responseBufferLimit" -Value 0
  $v = "HTTP_X_REMOTE_USER"
  $has = Get-WebConfiguration -PSPath $apphost -Filter "system.webServer/rewrite/allowedServerVariables/add[@name='$v']"
  if (-not $has) { Add-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/rewrite/allowedServerVariables" -Name "." -Value @{ name = $v } }
}
Ok "ARR proxy bật (giữ nguyên Host gốc để Server Actions của Next.js hoạt động)"

# site + application pool + web.config
$siteDir = Join-Path $App "iis"
Do-It "Ghi $siteDir\web.config" {
  New-Item -ItemType Directory -Force -Path $siteDir | Out-Null
  $tpl = Get-Content (Join-Path $App "deploy\iis\web.config.template") -Raw -Encoding UTF8
  $wc = $tpl.Replace("__PORT__", "$NodePort")
  [IO.File]::WriteAllText((Join-Path $siteDir "web.config"), $wc, (New-Object Text.UTF8Encoding($false)))
  Lock-Acl (Join-Path $siteDir "web.config") "IIS_IUSRS"
}
Do-It "Tạo / cập nhật application pool và site '$SiteName'" {
  Import-Module WebAdministration
  if (-not (Test-Path "IIS:\AppPools\$SiteName")) { New-WebAppPool -Name $SiteName | Out-Null }
  Set-ItemProperty "IIS:\AppPools\$SiteName" -Name managedRuntimeVersion -Value ""
  Set-ItemProperty "IIS:\AppPools\$SiteName" -Name startMode -Value "AlwaysRunning"
  if (-not (Test-Path "IIS:\Sites\$SiteName")) {
    New-Website -Name $SiteName -PhysicalPath $siteDir -ApplicationPool $SiteName -Port $HttpPort -HostHeader $HostName | Out-Null
  } else {
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $siteDir
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $SiteName
  }
  $apphost = "MACHINE/WEBROOT/APPHOST"
  $auth = "system.webServer/security/authentication"
  $loc = $SiteName
  Set-WebConfigurationProperty -PSPath $apphost -Location $loc -Filter "$auth/anonymousAuthentication" -Name enabled -Value $false
  Set-WebConfigurationProperty -PSPath $apphost -Location $loc -Filter "$auth/windowsAuthentication" -Name enabled -Value $true

  # Riêng /inbox/api/v1 (API máy gọi máy, mã Bearer, không có người dùng Windows): cho Anonymous, tắt Windows Authentication.
  # Đặt bằng <location> trong applicationHost.config nên không cần mở khóa mục authentication (khác với <location> trong web.config của site).
  # Tạo sẵn thư mục rỗng cùng tên để đường dẫn tồn tại thật trong site (IIS Manager chọn được, tránh phụ thuộc cách IIS xử lý location cho đường dẫn ảo).
  # Yêu cầu vẫn đi qua rule InboxProxy trong web.config (rewrite xảy ra sau bước xác thực) nên vẫn được chuyển sang Node.
  New-Item -ItemType Directory -Force -Path (Join-Path $siteDir ($ApiPath.Replace("/", "\"))) | Out-Null
  $apiLoc = "$SiteName/$ApiPath"
  Set-WebConfigurationProperty -PSPath $apphost -Location $apiLoc -Filter "$auth/anonymousAuthentication" -Name enabled -Value $true
  Set-WebConfigurationProperty -PSPath $apphost -Location $apiLoc -Filter "$auth/windowsAuthentication" -Name enabled -Value $false

  if ((Get-Website -Name $SiteName).State -ne "Started") { Start-Website -Name $SiteName }
}
Ok "Site IIS '$SiteName' (cổng $HttpPort$(if ($HostName) { ", tên $HostName" })) — Windows Authentication bật, Anonymous tắt; riêng /$ApiPath cho Anonymous (API hệ thống nguồn, mã Bearer)"
if (-not $DryRun -and $HttpPort -eq 80) {
  $def = Get-Website | Where-Object { $_.Name -ne $SiteName -and ($_.Bindings.Collection | Where-Object { $_.bindingInformation -like "*:80:" }) }
  if ($def) { Warn "Site '$($def.Name)' cũng đang nghe cổng 80 không tên miền → xung đột. Tắt nó hoặc đặt -HostName cho site $SiteName." }
}

# ---------- 9. tường lửa ----------
Step "9/11" "Tường lửa Windows"
$fwPort = $HttpPort
$fwName = "Inbox ($ServiceName) TCP $fwPort"
if (Get-NetFirewallRule -DisplayName $fwName -ErrorAction SilentlyContinue) { Ok "Đã có rule '$fwName'" } else {
  Do-It "Mở cổng $fwPort (chỉ mạng Domain / Private)" { New-NetFirewallRule -DisplayName $fwName -Direction Inbound -Protocol TCP -LocalPort $fwPort -Action Allow -Profile Domain, Private | Out-Null }
  Ok "Đã mở cổng $fwPort cho mạng nội bộ (cổng Node $NodePort KHÔNG mở ra ngoài)"
}

# ---------- 10. kiểm tra tự động ----------
Step "10/11" "Kiểm tra tự động"
if ($DryRun) { Say "   [DRY-RUN] bỏ qua kiểm tra" "Yellow" } else {
  $page = "http://127.0.0.1:$NodePort$BasePath/viec-can-xu-ly"
  $up = $false
  foreach ($i in 1..30) { if ((Probe $page @{}).Code -ne -1) { $up = $true; break }; Start-Sleep -Seconds 2 }
  if (-not $up) { Die "Node không trả lời ở cổng $AppPort sau 60 giây." "Xem $logDir\server-error.log và $logDir\server.log (lỗi thường gặp: .env sai, DB không kết nối được)." }
  Ok "Node đang chạy ở cổng $AppPort"
  # Không có mã bí mật: x-remote-user được tin trực tiếp (xem middleware.ts), an toàn chỉ nhờ Node chỉ nghe 127.0.0.1.
  # Gọi thẳng Node từ chính máy chủ này cũng giả mạo được header — đây là đánh đổi đã chọn, không phải lỗi.
  $noHeader = (Probe $page @{}).Code
  if ($noHeader -eq 200) { Die "Không có header x-remote-user mà Node vẫn trả 200 (mong đợi 403)." "Kiểm tra môi trường: NODE_ENV=production và KHÔNG có ALLOW_USER_SWITCH / AUTH_TEST_LOGIN trong $envPath." }
  Ok "Không có header x-remote-user → bị chặn ($noHeader)"
  if ($TestAccount) {
    $pos = (Probe $page @{ "x-remote-user" = "$Domain\$TestAccount" }).Code
    if ($pos -ne 200) { Die "Header x-remote-user = $Domain\$TestAccount nhưng Node trả mã $pos (mong đợi 200)." "Xem $logDir\server-error.log; kiểm tra AUTH_AD_DOMAIN khớp '$Domain' và DATABASE_URL trong $envPath kết nối được." }
    Ok "Header x-remote-user + tài khoản kiểm tra → vào được (200), DB kết nối được"
  } else { Warn "Không có -TestAccount: bỏ qua kiểm tra vào trang bằng tài khoản (chưa xác nhận kết nối DB từ trang chính)." }
  $api = (Probe "http://127.0.0.1:$NodePort/$ApiPath/systems" @{}).Code
  if ($api -ne 401) { Warn "API /$ApiPath/systems không kèm mã trả $api (mong đợi 401 từ ứng dụng). Xem $logDir\server-error.log." }
  else { Ok "API /$ApiPath yêu cầu mã Bearer (401 khi thiếu mã)" }
  Warn "Node không có mã bí mật xác thực IIS: bất kỳ ai gọi thẳng tới 127.0.0.1:$NodePort (từ chính máy chủ) đều có thể giả mạo x-remote-user. Đảm bảo không ai khác có quyền chạy mã trên máy chủ này."

  $web = "http://$(if ($HostName) { $HostName } else { 'localhost' })$(if ($HttpPort -ne 80) { ':' + $HttpPort })"
  $viaIis = Probe "$web$BasePath/viec-can-xu-ly" @{} -WindowsCredentials
  if ($viaIis.Code -eq 200) { Ok "Qua IIS bằng tài khoản đang đăng nhập máy chủ: mã 200" }
  else { Warn "Qua IIS ($web$BasePath/viec-can-xu-ly) trả mã $($viaIis.Code) (-1 = không kết nối được: tên miền chưa có DNS / hosts?). Nếu 401: thử bằng trình duyệt trong domain. Nếu 500/502/404: xem docs/trien-khai-iis-offline.md mục 'Sự cố thường gặp'." }
  # Đường dẫn API gọi KHÔNG kèm thông tin đăng nhập: IIS phải để lọt tới ứng dụng (401 JSON, không có WWW-Authenticate: Negotiate/NTLM)
  $viaIisApi = Probe "$web/$ApiPath/systems" @{}
  if ($viaIisApi.Code -eq 401 -and $viaIisApi.Auth -notmatch "Negotiate|NTLM") { Ok "Qua IIS, /$ApiPath cho gọi không cần tài khoản Windows (ứng dụng trả 401 vì thiếu mã Bearer)" }
  elseif ($viaIisApi.Code -eq -1) { Warn "Không kiểm tra được /$ApiPath qua IIS (${web}: không kết nối được)." }
  else { Warn "Qua IIS, /$ApiPath trả mã $($viaIisApi.Code)$(if ($viaIisApi.Auth) { " (IIS đòi đăng nhập Windows: $($viaIisApi.Auth))" }) — mong đợi 401 từ ứng dụng. Hệ thống nguồn (kho) sẽ KHÔNG gọi được API nếu IIS chặn Anonymous ở đường dẫn này: xem docs/trien-khai-iis-offline.md mục F.7 bước 7." }
}

# ---------- 11. tổng kết ----------
Step "11/11" "Tổng kết"
$url = "http://$(if ($HostName) { $HostName } else { $env:COMPUTERNAME })$(if ($HttpPort -ne 80) { ':' + $HttpPort })$BasePath/viec-can-xu-ly"
Say "`nHOÀN TẤT$(if ($DryRun) { ' (xem trước — chưa thay đổi gì)' })." "Green"
Say "  Địa chỉ        : $url"
Say "  Đăng nhập      : tài khoản Windows trong domain (trình duyệt trong domain tự đăng nhập). Hệ thống không có bảng người dùng: ai vào được chỉ thấy việc giao cho tài khoản của mình."
Say "  Đăng ký hệ thống nguồn : POST /$ApiPath/systems bằng mã quản trị INBOX_ADMIN_TOKEN (nằm trong $envPath) — xem docs/api.md"
Say "  File cấu hình  : $envPath  (chứa bí mật — hãy sao lưu an toàn: mất INBOX_SIGNING_KEY thì phải cấp lại action-secret cho từng hệ thống nguồn)"
Say "  Nhật ký API    : $(if ($cfg.Contains('AUDIT_LOG_DIR')) { $cfg['AUDIT_LOG_DIR'] } else { Join-Path $DataDir 'audit' })  (audit-YYYY-MM-DD.log, không tự xóa — nhớ đưa vào lịch sao lưu / dọn)"
Say "  Log dịch vụ    : $logDir\server.log, server-error.log      Log cài đặt: $Log"
if ($Steps.Warn.Count) { Say "`nCẦN XEM LẠI:" "Yellow"; $Steps.Warn | ForEach-Object { Say "  - $_" "Yellow" } }
Stop-Transcript | Out-Null
