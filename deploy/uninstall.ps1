<#
.SYNOPSIS
  Gỡ dịch vụ / site IIS / rule tường lửa của Việc cần xử lý (inbox). Chạy bằng PowerShell "Run as administrator".

.DESCRIPTION
  KHÔNG BAO GIỜ xóa database, nhật ký hoạt động API (AUDIT_LOG_DIR, mặc định <DataDir>\audit) hay file .env. Mặc định cũng giữ thư mục cài đặt; thêm -RemoveFiles để xóa
  thư mục cài (vẫn giữ .env, DataDir, database). Gỡ PostgreSQL / IIS / Node.js: làm tay trong "Apps & features" nếu thật sự cần.

.PARAMETER ServiceName  Tên dịch vụ (mặc định InboxServer)
.PARAMETER SiteName     Tên site IIS (mặc định Inbox)
.PARAMETER InstallDir   Thư mục cài (chỉ dùng với -RemoveFiles)
.PARAMETER RemoveFiles  Xóa thư mục cài đặt (trừ .env)
.PARAMETER DryRun       Chỉ in việc sẽ làm
#>
[CmdletBinding()]
param(
  [string]$ServiceName = "InboxServer",
  [string]$SiteName = "Inbox",
  [string]$InstallDir = "C:\apps\kujiraa-inbox",
  [switch]$RemoveFiles,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2

# Đường dẫn API máy gọi máy mà install.ps1 đã cho Anonymous (khớp $ApiPath trong install.ps1: BASE_PATH của lib/base-path.ts + /api/v1)
$ApiPath = "inbox/api/v1"

function Say($m, $c = "Gray") { Write-Host $m -ForegroundColor $c }
function Do-It($desc, [scriptblock]$sb) { if ($DryRun) { Say "[DRY-RUN] $desc" "Yellow" } else { Say "-> $desc"; & $sb } }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Say "LỖI: cần quyền Administrator (PowerShell → Run as administrator)." "Red"; exit 1
}

Say "=== GỠ VIỆC CẦN XỬ LÝ / INBOX (database, nhật ký API, .env được GIỮ NGUYÊN) ===" "Cyan"

$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  $nssm = Join-Path $InstallDir "tools\nssm.exe"
  Do-It "Dừng và xóa dịch vụ $ServiceName" {
    Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
    if (Test-Path $nssm) { & $nssm remove $ServiceName confirm | Out-Null } else { & sc.exe delete $ServiceName | Out-Null }
  }
} else { Say "Không có dịch vụ $ServiceName." }

if (Get-Module -ListAvailable WebAdministration) {
  Import-Module WebAdministration
  # Cấu hình xác thực theo <location> trong applicationHost.config không tự mất khi xóa site → xóa riêng (không đụng site khác)
  $apphost = "MACHINE/WEBROOT/APPHOST"
  $auth = "system.webServer/security/authentication"
  Do-It "Xóa cấu hình xác thực riêng của $SiteName và $SiteName/$ApiPath" {
    foreach ($loc in @("$SiteName/$ApiPath", $SiteName)) {
      foreach ($section in @("anonymousAuthentication", "windowsAuthentication")) {
        try { Clear-WebConfiguration -PSPath $apphost -Location $loc -Filter "$auth/$section" -ErrorAction Stop }
        catch { Say "   !! Không xóa được cấu hình $section của '$loc' ($($_.Exception.Message)) — kiểm tra tay trong applicationHost.config." "Yellow" }
      }
    }
  }
  if (Test-Path "IIS:\Sites\$SiteName") { Do-It "Xóa site IIS $SiteName" { Remove-Website -Name $SiteName } } else { Say "Không có site IIS $SiteName." }
  if (Test-Path "IIS:\AppPools\$SiteName") { Do-It "Xóa application pool $SiteName" { Remove-WebAppPool -Name $SiteName } }
} else { Say "IIS chưa cài — bỏ qua." }

$rules = Get-NetFirewallRule -DisplayName "Inbox ($ServiceName) TCP *" -ErrorAction SilentlyContinue
if ($rules) { Do-It "Xóa rule tường lửa Inbox ($ServiceName)" { $rules | Remove-NetFirewallRule } } else { Say "Không có rule tường lửa của Inbox." }

if ($RemoveFiles -and (Test-Path $InstallDir)) {
  Do-It "Xóa nội dung $InstallDir (trừ .env)" {
    Get-ChildItem $InstallDir -Force | Where-Object { $_.Name -ne ".env" } | Remove-Item -Recurse -Force
  }
} else { Say "Giữ nguyên thư mục cài ($InstallDir). Thêm -RemoveFiles nếu muốn xóa." }

Say "`nXONG. Database và nhật ký hoạt động API vẫn còn nguyên." "Green"
