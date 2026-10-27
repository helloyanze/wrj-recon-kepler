@echo off
rem Launch the WRJ demo frontend from the prebuilt dist/ (fully offline, no network needed).
rem Node resolution order: runtime\node.exe -> node\node.exe -> .\node.exe -> system PATH.
rem Drop a portable (zip) Node's node.exe into runtime\ to make this kit self-contained.
rem All user-facing messages are printed by scripts/serve-offline.mjs (UTF-8).
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_BIN="
if exist "runtime\node.exe" set "NODE_BIN=runtime\node.exe"
if not defined NODE_BIN if exist "node\node.exe" set "NODE_BIN=node\node.exe"
if not defined NODE_BIN if exist "node.exe" set "NODE_BIN=node.exe"

if not defined NODE_BIN (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo         Put a portable node.exe at runtime\node.exe, or install Node.js 22+.
    pause
    exit /b 1
  )
  set "NODE_BIN=node"
)

if not exist "dist\index.html" (
  if exist "node_modules" (
    where npm >nul 2>nul
    if errorlevel 1 (
      echo [ERROR] dist\ missing and npm not found in PATH; cannot build.
      pause
      exit /b 1
    )
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

"%NODE_BIN%" scripts\serve-offline.mjs %*

echo.
echo [INFO] Server stopped.
pause
