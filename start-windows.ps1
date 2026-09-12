$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root '.venv-win\Scripts\python.exe'
function Check-Command {
    if ($LASTEXITCODE -ne 0) { throw 'Command failed. See the error above.' }
}
if (-not (Test-Path $python)) {
    & py -3.13 -m venv (Join-Path $root '.venv-win')
    Check-Command
}
$marker = Join-Path $root '.venv-win\monitor-ready'
if (-not (Test-Path $marker)) {
    & $python -m pip install -r (Join-Path $root 'backend\requirements.txt') pyyaml==6.0.2 psutil==6.0.0
    Check-Command
    New-Item $marker -ItemType File -Force | Out-Null
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS and restart this launcher.' }
if (-not (Test-Path (Join-Path $root 'frontend\node_modules\vite'))) {
    Push-Location (Join-Path $root 'frontend')
    try { & npm.cmd ci; Check-Command } finally { Pop-Location }
}
# Local token persists between starts. Do not overwrite an existing server .env.
$envPath = Join-Path $root 'backend\.env'
if (-not (Test-Path $envPath)) {
    $token = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    "SECRET_KEY=$token`nDEBUG=false" | Set-Content $envPath -Encoding ASCII
}
$listening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
if (-not ($listening | Where-Object LocalPort -eq 8000)) {
    Start-Process $python -ArgumentList '-m uvicorn app.main:app --host 0.0.0.0 --port 8000' -WorkingDirectory (Join-Path $root 'backend') | Out-Null
}
if (-not ($listening | Where-Object LocalPort -eq 5173)) {
    Start-Process 'cmd.exe' -ArgumentList '/c npm.cmd run dev -- --host 0.0.0.0 --strictPort' -WorkingDirectory (Join-Path $root 'frontend') | Out-Null
}
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 2
        $page = Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2
        if ($health.status -eq 'ok' -and $page.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw 'Server did not start. Check the backend/frontend windows and ports 8000 and 5173.' }
Start-Process 'http://127.0.0.1:5173/inventory'
Write-Host 'Monitor is ready. Close the backend/frontend windows to stop it.'