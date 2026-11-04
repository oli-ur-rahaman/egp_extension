@echo off
REM PDMS eGP Extractor - start the controlled dev/recon Chrome.
REM
REM Double-click this file, or run it from a terminal. It:
REM   1. rebuilds dist/ so the Chrome window loads the current code
REM   2. opens a SEPARATE Chrome profile (.chrome-debug-profile, git-ignored)
REM      with the DevTools port 9222 open and the extension loaded unpacked
REM
REM Your everyday Chrome profile is never touched. You log in to e-GP
REM yourself inside this window. Close the window to cut the CDP link.

setlocal
cd /d "%~dp0"

echo [1/2] Building dist/ ...
call npm.cmd run build
if errorlevel 1 (
  echo.
  echo Build failed. Fix the error above, then run this file again.
  pause
  exit /b 1
)

echo.
echo [2/2] Starting controlled Chrome on port 9222 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\launch-chrome.ps1" -WithExtension
if errorlevel 1 (
  echo.
  echo Chrome did not start. Read the message above.
  pause
  exit /b 1
)

echo.
echo Ready. In Claude Code / a terminal, confirm the link with:
echo     npm run recon -- ping
echo.
echo Leave this window open or close it, either is fine.
timeout /t 8 >nul
endlocal
