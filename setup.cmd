@echo off
rem PDMS: get this PC ready, or up to date. Double-click it, or run setup.cmd in a terminal. Safe to run any time.
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Install it from https://git-scm.com/download/win , then run setup.cmd again.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org , then run setup.cmd again.
  pause
  exit /b 1
)
node tools\setup.js %*
pause
