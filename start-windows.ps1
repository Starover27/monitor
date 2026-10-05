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

# Build фронта (если ещё не собран): бэкенд раздаёт портал с порта 80 (без номера порта в адресе).
$distDir = Join-Path $root 'frontend\dist'
if (-not (Test-Path (Join-Path $distDir 'index.html'))) {
    Write-Host "Building frontend for production..."
    Push-Location (Join-Path $root 'frontend')
    try {
        & npm.cmd run build
        Check-Command
    } finally { Pop-Location }
}

$listening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
if (-not ($listening | Where-Object LocalPort -eq 80)) {
    Start-Process $python -ArgumentList '-m uvicorn app.main:app --host 0.0.0.0 --port 80' -WorkingDirectory (Join-Path $root 'backend') | Out-Null
}
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1/health' -TimeoutSec 2
        if ($health.status -eq 'ok') { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw 'Backend did not start on port 80. Check the backend window.' }
Start-Process 'http://127.0.0.1/inventory'
Write-Host "Monitor is ready - portal on http://127.0.0.1 (port 80, no port number in URL)"
Write-Host 'Close the backend window to stop it.'