$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $project
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $env:LOCALAPPDATA 'hermes\node\node.exe' }
if (-not (Test-Path -LiteralPath $node)) { throw 'Install Node.js 22 or newer, then run this again.' }
if (-not (Test-Path -LiteralPath (Join-Path $project 'node_modules\qrcode'))) { throw 'Run npm install in this folder once before starting Haven.' }
$remoteFile = Join-Path $project '.runtime\remote-url.txt'
if (Test-Path -LiteralPath $remoteFile) { $env:HAVEN_REMOTE_URL = (Get-Content -LiteralPath $remoteFile -Raw).Trim() }
try {
  $existing = Invoke-RestMethod 'http://127.0.0.1:4318/api/info' -TimeoutSec 2
  if ($existing.version -eq '0.1.0') {
    $hostLink = Get-Content -LiteralPath (Join-Path $project '.runtime\host-url.txt') -Raw
    Start-Process $hostLink
    Write-Host 'Haven is already running. Opened the host dashboard.'
    exit 0
  }
} catch {}
$helper = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'open-dashboard.ps1')+'"')) -WindowStyle Hidden -PassThru
Write-Host 'Haven host is running. Keep this window open. Close it or press Ctrl+C to stop all access.' -ForegroundColor Cyan
& $node (Join-Path $project 'server.mjs')
