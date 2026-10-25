@echo off
rem Launch the WRJ demo frontend from the prebuilt dist/ (fully offline, no network needed).
rem All user-facing messages are printed by scripts/serve-offline.mjs (UTF-8).
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 22+ first.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  if exist "node_modules" (
    echo [INFO] dist\ not found, building locally with npm run build ...
    call npm.cmd run build
    if errorlevel 1 (
      echo [ERROR] Build failed. See messages above.
      pause
      exit /b 1
    )
  ) else (
    echo [ERROR] dist\ missing and node_modules\ missing.
    echo         Run: npm ci --legacy-peer-deps ^&^& npm run build
    pause
    exit /b 1
  )
)

node scripts\serve-offline.mjs %*

echo.
echo [INFO] Server stopped.
pause
