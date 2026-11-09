<#
.SYNOPSIS
  Đóng gói bản phát hành Việc cần xử lý (inbox) để mang sang máy chủ KHÔNG có internet. CHẠY TRÊN MÁY CÓ INTERNET (máy dev), tại thư mục gốc dự án.

.DESCRIPTION
  1. npm ci + npm run build (npm ci cần internet).
  2. Gom file chạy production vào thư mục release\inbox-<phiên bản>\: bản Next.js standalone (server.js do Next tự sinh,
     ~80 MB thay vì ~450 MB node_modules) cộng các gói mà scripts\*.mjs cài đặt (chạy ngoài Next) cần thêm (drizzle-orm, pg, dotenv).
  3. Tải bộ cài cần dùng offline vào ...\vendor\ (Node.js, NSSM, IIS URL Rewrite, IIS ARR) và kiểm tra chữ ký số của file .msi.
     PostgreSQL KHÔNG tự tải (file lớn, chọn phiên bản theo công ty): tự bỏ file cài vào vendor\ (xem docs/trien-khai-iis-offline.md).
  4. Nén thành release\inbox-<phiên bản>.zip. Mang file zip sang máy chủ, giải nén, chạy deploy\install.ps1 (Run as administrator).

.PARAMETER OutDir      Thư mục đầu ra (mặc định .\release)
.PARAMETER SkipVendor  Không tải bộ cài (khi máy chủ đã cài đủ Node / IIS modules, hoặc sẽ tự bỏ vào vendor\)
.PARAMETER SkipBuild   Dùng .next có sẵn (chỉ khi vừa build xong, cùng mã nguồn)
.PARAMETER NoZip       Chỉ tạo thư mục, không nén
.PARAMETER DryRun      Chỉ in việc sẽ làm, không đổi gì

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\build-release.ps1
#>
[CmdletBinding()]
param(
  [string]$OutDir = "release",
  [switch]$SkipVendor,
  [switch]$SkipBuild,
  [switch]$NoZip,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2

# Địa chỉ tải: nếu nhà cung cấp đổi đường dẫn, script chỉ CẢNH BÁO — tải tay file về vendor\ (đúng tên) rồi chạy lại với -SkipVendor
$Vendor = @(
  @{ Name = "nodejs-x64.msi"; Url = "https://nodejs.org/dist/v{NODE}/node-v{NODE}-x64.msi"; Signed = $true },
  @{ Name = "nssm-2.24.zip"; Url = "https://nssm.cc/release/nssm-2.24.zip"; Signed = $false },
  @{ Name = "rewrite_amd64_en-US.msi"; Url = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"; Signed = $true },
  @{ Name = "requestRouter_amd64.msi"; Url = "https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi"; Signed = $true }
)

function Step($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "LỖI: $m" -ForegroundColor Red; exit 1 }
function Run($desc, [scriptblock]$sb) {
  if ($DryRun) { Write-Host "[DRY-RUN] $desc" -ForegroundColor Yellow; return }
  Write-Host "-> $desc"
  & $sb
  if ($LASTEXITCODE -ne 0) { Fail "$desc thất bại (mã $LASTEXITCODE)" }
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path "package.json")) { Fail "Chạy script trong thư mục dự án (không thấy package.json tại $root)." }

Step "Kiểm tra môi trường"
foreach ($c in "node", "npm") { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Fail "Chưa cài $c trên máy build." } }
$nodeVer = (node -v).TrimStart("v")
Write-Host "Node $nodeVer · npm $(npm -v)"
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$commit = "nogit"
if (Get-Command git -ErrorAction SilentlyContinue) { $h = (git rev-parse --short HEAD 2>$null); if ($h) { $commit = $h } }
$name = "inbox-{0}-{1}" -f (Get-Date -Format "yyyyMMdd"), $commit
$out = if ([IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $root $OutDir }
$stage = Join-Path $out $name
Write-Host "Bản phát hành: $name -> $stage"

if (-not $SkipBuild) {
  Step "Cài gói và build"
  Run "npm ci" { npm ci }
  Run "npm run build" { npm run build }
} elseif (-not (Test-Path ".next\BUILD_ID")) { Fail "-SkipBuild nhưng chưa có .next\BUILD_ID — bỏ -SkipBuild." }

Step "Gom file chạy production"
if (Test-Path $stage) { Run "Xóa thư mục cũ $stage" { Remove-Item -Recurse -Force $stage } }
Run "Tạo $stage" { New-Item -ItemType Directory -Force -Path $stage | Out-Null }
$copy = @(
  @{ Src = "db\migrations"; Dst = "db\migrations" },
  @{ Src = "scripts"; Dst = "scripts"; Only = @("migrate-prod.mjs", "create-db.mjs", "prod-env.mjs") },
  @{ Src = "deploy"; Dst = "deploy" },
  @{ Src = "docs"; Dst = "docs" }
)
foreach ($c in $copy) {
  if (-not (Test-Path $c.Src)) { Fail "Thiếu thư mục $($c.Src)" }
  $dst = Join-Path $stage $c.Dst
  Run "Sao chép $($c.Src)" {
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    $items = Get-ChildItem -LiteralPath $c.Src -Force
    if ($c.ContainsKey("Exclude")) { $items = $items | Where-Object { $c.Exclude -notcontains $_.Name } }
    if ($c.ContainsKey("Only")) { $items = $items | Where-Object { $c.Only -contains $_.Name } }
    $items | Copy-Item -Destination $dst -Recurse -Force
  }
}
if (Test-Path "README.md") { Run "Sao chép README.md" { Copy-Item "README.md" $stage -Force } }
# .next\standalone đã tự chứa server.js (do Next sinh), package.json, public/, .next\static (xem scripts\post-build.mjs)
# — chỉ server.js/package.json của chính dự án mới cần bỏ qua .env* (bí mật máy build không được đi theo gói).
$standalone = ".next\standalone"
if (-not $DryRun -and -not (Test-Path (Join-Path $standalone "server.js"))) { Fail "Thiếu .next\standalone — next.config.ts phải có output: 'standalone', rồi build lại (bỏ -SkipBuild)." }
Run "Sao chép .next\standalone (bỏ .env*)" {
  Get-ChildItem -LiteralPath $standalone -Force |
    Where-Object { $_.Name -notlike ".env*" } |
    Copy-Item -Destination $stage -Recurse -Force
}
Run "Thêm gói Next không tự mang theo (drizzle-orm, pg, dotenv — dùng bởi scripts\*.mjs chạy ngoài Next)" { node deploy\copy-prod-deps.mjs $root $stage drizzle-orm pg dotenv }
if (-not $DryRun) {
  foreach ($m in "next", "drizzle-orm", "pg", "dotenv", "@next\env") {
    if (-not (Test-Path (Join-Path $stage "node_modules\$m\package.json"))) { Fail "node_modules thiếu '$m' trong bản phát hành." }
  }
  if (-not (Test-Path (Join-Path $stage ".next\BUILD_ID"))) { Fail "Thiếu .next\BUILD_ID trong bản phát hành." }
}

Step "Bộ cài offline (vendor)"
$vend = Join-Path $stage "vendor"
Run "Tạo $vend" { New-Item -ItemType Directory -Force -Path $vend | Out-Null }
if ($SkipVendor) {
  Write-Host "Bỏ qua (-SkipVendor). Tự bỏ file cài vào $vend nếu máy chủ chưa có."
} else {
  foreach ($v in $Vendor) {
    $url = $v.Url.Replace("{NODE}", $nodeVer)
    $dest = Join-Path $vend $v.Name
    if ($DryRun) { Write-Host "[DRY-RUN] tải $url -> $dest" -ForegroundColor Yellow; continue }
    try {
      Write-Host "-> tải $($v.Name)"
      Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
      if ($v.Signed) {
        $sig = Get-AuthenticodeSignature $dest
        if ($sig.Status -ne "Valid") { Remove-Item $dest -Force; throw "chữ ký số không hợp lệ ($($sig.Status))" }
        Write-Host "   chữ ký hợp lệ: $($sig.SignerCertificate.Subject)"
      }
    } catch {
      Write-Host "CẢNH BÁO: không tải được $($v.Name): $($_.Exception.Message)" -ForegroundColor Yellow
      Write-Host "   Tải tay từ $url (hoặc trang chủ nhà cung cấp), đặt vào $vend với đúng tên $($v.Name)." -ForegroundColor Yellow
    }
  }
}
if (-not $DryRun) {
  "Bỏ bộ cài PostgreSQL (postgresql-*-windows-x64.exe, tải từ enterprisedb.com) vào thư mục này nếu máy chủ chưa có PostgreSQL." |
    Set-Content -Encoding UTF8 (Join-Path $vend "README.txt")
  [ordered]@{ name = $name; app = $pkg.name; commit = $commit; builtAt = (Get-Date).ToString("s"); nodeBuild = $nodeVer } |
    ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $stage "release.json")
}

if (-not $NoZip) {
  Step "Nén"
  $zip = Join-Path $out "$name.zip"
  if (Test-Path $zip) { Run "Xóa $zip cũ" { Remove-Item -Force $zip } }
  # tar.exe (có sẵn Windows 10+) nhanh và không giới hạn 2 GB như Compress-Archive của PowerShell 5.1
  Run "Nén $zip" { tar.exe -a -c -f $zip -C $out $name }
  if (-not $DryRun) { Write-Host ("Kích thước: {0:N0} MB" -f ((Get-Item $zip).Length / 1MB)) }
}

Write-Host "`nXONG. Mang '$name.zip' sang máy chủ, giải nén, rồi chạy deploy\install.ps1 bằng PowerShell 'Run as administrator'." -ForegroundColor Green
