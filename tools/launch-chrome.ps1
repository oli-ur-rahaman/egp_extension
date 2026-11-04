<#
.SYNOPSIS
  Opens a separate Chrome window for recon, with the DevTools debugging port open.

.DESCRIPTION
  Uses its own profile folder, so your everyday Chrome profile is never touched.
  You log in to e-GP inside this window yourself. Close the window to cut the link.
  The profile folder is git-ignored: it holds your logged-in session cookies.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\launch-chrome.ps1
  powershell -ExecutionPolicy Bypass -File tools\launch-chrome.ps1 -WithExtension
  powershell -ExecutionPolicy Bypass -File tools\launch-chrome.ps1 -Port 9223 -ProfileDir D:\egp-profile
#>
param(
  [string]$ProfileDir = (Join-Path (Split-Path $PSScriptRoot -Parent) '.chrome-debug-profile'),
  [int]$Port = 9222,
  [string]$Url = 'https://www.eprocure.gov.bd',
  [switch]$WithExtension
)

$ErrorActionPreference = 'Stop'

$candidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$chrome = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome not found. Install Google Chrome or edit the candidate paths in this script.' }

try {
  $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 1
  Write-Host "Something is already listening on port $Port. Close that Chrome window, or pass -Port <other>." -ForegroundColor Yellow
  exit 1
} catch { }

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$chromeArgs = @(
  "--remote-debugging-port=$Port",
  '--remote-allow-origins=http://127.0.0.1',
  "--user-data-dir=`"$ProfileDir`"",
  '--no-first-run',
  '--no-default-browser-check'
)

if ($WithExtension) {
  $dist = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'
  if (-not (Test-Path (Join-Path $dist 'manifest.json'))) {
    throw "No build found at $dist. Run: npm run build"
  }
  $chromeArgs += "--load-extension=`"$dist`""
}

$chromeArgs += $Url

Start-Process -FilePath $chrome -ArgumentList $chromeArgs

Write-Host "Debug Chrome started on port $Port"
if ($WithExtension) { Write-Host "Extension loaded from dist/ (unpacked)" }
Write-Host "Profile folder: $ProfileDir"
Write-Host "Check the link with: npm run recon -- ping"
