@echo off
setlocal
cd /d "%~dp0"

if exist "node_modules\" (
    echo node_modules da ton tai, bo qua giai nen.
    exit /b 0
)

if not exist "node_modules.tar.xz" (
    echo Khong tim thay node_modules.tar.xz
    exit /b 1
)

echo Dang giai nen node_modules.tar.xz ...
tar -xf node_modules.tar.xz
if errorlevel 1 (
    echo Giai nen that bai.
    rmdir /s /q node_modules 2>nul
    exit /b 1
)

echo Hoan tat.
exit /b 0
