@echo off
rem Dong goi ban phat hanh (build standalone + bo cai offline + zip). CHAY TREN MAY CO INTERNET.
rem Nhap dup file nay, hoac: deploy\build-release.cmd [-SkipVendor] [-SkipBuild] [-NoZip] [-DryRun] [-OutDir <thu muc>]
rem Chi tiet: deploy\build-release.ps1 va docs\trien-khai-iis-offline.md
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "deploy\build-release.ps1" %*
set RC=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %RC%
