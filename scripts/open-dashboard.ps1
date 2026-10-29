$project = Split-Path $PSScriptRoot -Parent
for ($attempt=0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 500
  try {
    $info = Invoke-RestMethod 'http://127.0.0.1:4318/api/info' -TimeoutSec 1
    $file = Join-Path $project '.runtime\host-url.txt'
    if ($info.version -eq '0.1.0' -and (Test-Path -LiteralPath $file)) {
      Start-Process (Get-Content -LiteralPath $file -Raw)
      exit 0
    }
  } catch {}
}
