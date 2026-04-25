@echo off
REM agentdeck launcher — double-click to start proxy + web and open the browser.
setlocal
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org/ then re-run this file.
  pause
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm is required. Install with: npm install -g pnpm
  pause
  exit /b 1
)
node "%~dp0scripts\launch.mjs"
pause
