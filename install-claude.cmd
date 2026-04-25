@echo off
REM Install agentdeck MCP into your local Claude Code CLI.
REM - Ensures workspace deps + MCP build
REM - Writes %USERPROFILE%\.claude\settings.json with mcpServers.agentdeck
REM - Pre-approves the 26 mcp__agentdeck__* tools
setlocal
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org/ then re-run.
  pause
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm is required. Install with: npm install -g pnpm
  pause
  exit /b 1
)
node "%~dp0scripts\install-claude.mjs"
echo.
pause
