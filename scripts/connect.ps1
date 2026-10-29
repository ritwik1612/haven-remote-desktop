$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$tail = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $tail) { $tail = 'C:\Program Files\Tailscale\tailscale.exe' }
if (-not (Test-Path -LiteralPath $tail)) { throw 'Install Tailscale from https://tailscale.com/download, sign in, then run this again.' }
$status = (& $tail status --json | ConvertFrom-Json)
if ($status.BackendState -ne 'Running') { throw 'Open Tailscale and sign in first, then run Connect Phone.cmd again.' }
$existing = (& $tail serve status --json | ConvertFrom-Json)
$dns = $status.Self.DNSName.TrimEnd('.')
$existingPort = $existing.TCP.'8443'
if ($existingPort) {
  $handler = $existing.Web."${dns}:8443".Handlers.'/'.Proxy
  if ($handler -ne 'http://127.0.0.1:4318') { throw 'Tailscale port 8443 is used by another service. Nothing was changed.' }
}
& $tail serve --bg --yes --https=8443 http://127.0.0.1:4318
if ($LASTEXITCODE -ne 0) { throw 'Tailscale Serve could not start. Follow any HTTPS enablement link above, then retry.' }
$verify = (& $tail serve status --json | ConvertFrom-Json)
if ($verify.Web."${dns}:8443".Handlers.'/'.Proxy -ne 'http://127.0.0.1:4318') { throw 'Could not verify the private HTTPS route.' }
$url = "https://${dns}:8443"
New-Item -ItemType Directory -Force (Join-Path $project '.runtime') | Out-Null
[System.IO.File]::WriteAllText((Join-Path $project '.runtime\remote-url.txt'),$url)
Write-Host "`nPrivate phone link: $url/connect" -ForegroundColor Green
Write-Host 'Connect Tailscale on your iPhone using the same account. Then open this link in Safari.'
Write-Host 'Restart Haven if it is already running so the dashboard picks up this link.'
Write-Host 'This uses private Tailscale Serve. Public Funnel is not enabled.'
