param(
  [switch]$SkipDesktop
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$automaRoot = Join-Path $projectRoot 'automa_mysic'
$frontendRoot = Join-Path $projectRoot 'Frontend'
$backendRoot = Join-Path $projectRoot 'Backend'
$envPath = Join-Path $automaRoot '.env'
$logRoot = Join-Path $projectRoot 'logs'

function Require-Command([string]$Name, [string]$InstallHint) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Falta $Name. $InstallHint"
  }
  return $command.Source
}

function Resolve-Command([string]$Name, [string[]]$FallbackPaths, [string]$InstallHint) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in $FallbackPaths) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  throw "Falta $Name. $InstallHint"
}

function Test-Endpoint([string]$Uri, [hashtable]$Headers = @{}) {
  try {
    Invoke-RestMethod -Uri $Uri -Headers $Headers -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Stop-ProcessTree([int]$ProcessId) {
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Read-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -Last 1
  if (-not $line) { return $null }
  return ($line -split '=', 2)[1].Trim()
}

function Wait-Endpoint([string]$Uri, [hashtable]$Headers, [int]$Attempts = 40) {
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    try {
      Invoke-RestMethod -Uri $Uri -Headers $Headers -TimeoutSec 3 | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 750
    }
  }
  throw "El servicio no respondió a tiempo: $Uri"
}

$node = Require-Command 'node' 'Instala Node.js LTS desde https://nodejs.org/'
$null = Require-Command 'python' 'Instala Python 3 y actívalo en PATH.'
$pythonScripts = Join-Path $env:APPDATA 'Python\Python312\Scripts'
$wingetFfmpeg = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Filter 'ffmpeg.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$ffmpegFallback = if ($wingetFfmpeg) { $wingetFfmpeg.FullName } else { $null }
$ffprobeFallback = if ($wingetFfmpeg) { Join-Path $wingetFfmpeg.DirectoryName 'ffprobe.exe' } else { $null }
$ytDlp = Resolve-Command 'yt-dlp' @((Join-Path $pythonScripts 'yt-dlp.exe')) 'Ejecuta: python -m pip install -U yt-dlp'
$ffmpeg = Resolve-Command 'ffmpeg' @($ffmpegFallback) 'Instala FFmpeg y añade su carpeta bin a PATH.'
$ffprobe = Resolve-Command 'ffprobe' @($ffprobeFallback) 'FFprobe se incluye con FFmpeg.'
$n8n = Resolve-Command 'n8n.cmd' @('D:\Mysic\npm-global\n8n.cmd') 'Instala n8n en D:\Mysic\npm-global.'
$npm = Require-Command 'npm.cmd' 'Node.js debe incluir npm.'

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Copia automa_mysic/.env.example como automa_mysic/.env y reemplaza ambos tokens."
}
$workerToken = Read-EnvValue $envPath 'ACQUISITION_WORKER_TOKEN'
if (-not $workerToken -or $workerToken -like 'replace-*') {
  throw 'Configura ACQUISITION_WORKER_TOKEN con un valor aleatorio en automa_mysic/.env.'
}
$env:YT_DLP_PATH = $ytDlp
$env:FFMPEG_PATH = $ffmpeg
$env:FFPROBE_PATH = $ffprobe
$env:N8N_USER_FOLDER = if ($env:N8N_USER_FOLDER) { $env:N8N_USER_FOLDER } else { 'D:\Mysic\n8n-data' }
$env:N8N_LISTEN_ADDRESS = '127.0.0.1'

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$workerOut = Join-Path $logRoot 'acquisition-worker.out.log'
$workerErr = Join-Path $logRoot 'acquisition-worker.err.log'
$n8nOut = Join-Path $logRoot 'n8n.out.log'
$n8nErr = Join-Path $logRoot 'n8n.err.log'
$desktopOut = Join-Path $logRoot 'mysic-desktop.out.log'
$desktopErr = Join-Path $logRoot 'mysic-desktop.err.log'
$backendOut = Join-Path $logRoot 'backend.out.log'
$backendErr = Join-Path $logRoot 'backend.err.log'
$lanAddressFile = Join-Path $logRoot 'lan-address.txt'
$started = @()

try {
  if (-not (Test-Endpoint 'http://127.0.0.1:4310/health' @{ Authorization = "Bearer $workerToken" })) {
    $worker = Start-Process -FilePath $node -ArgumentList 'acquisition-worker.js' -WorkingDirectory $automaRoot -WindowStyle Hidden -RedirectStandardOutput $workerOut -RedirectStandardError $workerErr -PassThru
    $started += $worker
    Wait-Endpoint 'http://127.0.0.1:4310/health' @{ Authorization = "Bearer $workerToken" }
  }
  $workerHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:4310/health' -Headers @{ Authorization = "Bearer $workerToken" } -TimeoutSec 3
  if (-not $workerHealth.ok) {
    throw "El worker arrancó, pero faltan dependencias. Revisa $workerErr"
  }

  if (-not (Test-Endpoint 'http://127.0.0.1:5678/healthz')) {
    $n8nProcess = Start-Process -FilePath $n8n -ArgumentList 'start' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $n8nOut -RedirectStandardError $n8nErr -PassThru
    $started += $n8nProcess
    Wait-Endpoint 'http://127.0.0.1:5678/healthz/readiness' @{} 120
  }

  if (-not (Test-Endpoint 'http://127.0.0.1:4000/api/health')) {
    $backend = Start-Process -FilePath $npm -ArgumentList 'run', 'dev' -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -PassThru
    $started += $backend
    Wait-Endpoint 'http://127.0.0.1:4000/api/health' @{}
  }

  Write-Host 'Actualizando imágenes desde Cloudinary...'
  & $npm --prefix $backendRoot run 'music:cloudinary:apply'
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'No se pudieron actualizar las imágenes desde Cloudinary. Se continuará con las imágenes ya sincronizadas.'
  }

  Write-Host 'Worker listo: http://127.0.0.1:4310'
  Write-Host 'n8n listo:    http://127.0.0.1:5678'
  $lanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.AddressState -eq 'Preferred'
    } |
    Sort-Object -Property InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress
  if ($lanAddress) {
    $mysicLanUrl = "http://${lanAddress}:5173"
    Set-Content -LiteralPath $lanAddressFile -Value $mysicLanUrl -Encoding utf8
    Write-Host "Mysic en la red: $mysicLanUrl"
  }
  if (-not $SkipDesktop) {
    $desktop = Start-Process -FilePath $npm -ArgumentList 'run', 'tauri:dev' -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput $desktopOut -RedirectStandardError $desktopErr -PassThru
    $started += $desktop
    Wait-Process -Id $desktop.Id
  } else {
    Write-Host 'Servicios activos. Presiona Ctrl+C para cerrarlos.'
    while ($true) { Start-Sleep -Seconds 2 }
  }
} finally {
  [array]::Reverse($started)
  foreach ($process in $started) {
    if ($process -and -not $process.HasExited) {
      Stop-ProcessTree -ProcessId $process.Id
    }
  }
}
