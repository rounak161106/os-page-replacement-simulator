@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run the Same-Wi-Fi Remote Server.
  pause
  exit /b 1
)
start "" http://localhost:3456
node server.js
