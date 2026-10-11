param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$frontendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tauriRoot = Join-Path $frontendRoot 'src-tauri'
$tauriConfigPath = Join-Path $tauriRoot 'tauri.conf.json'
$identityPath = Join-Path $tauriRoot 'msix\store-identity.json'
$manifestTemplatePath = Join-Path $tauriRoot 'msix\AppxManifest.xml.template'
$releaseExe = Join-Path $tauriRoot 'target\release\mysic.exe'
$iconsRoot = Join-Path $tauriRoot 'icons'
$msixTargetRoot = [IO.Path]::GetFullPath((Join-Path $tauriRoot 'target\msix'))
$stageRoot = [IO.Path]::GetFullPath((Join-Path $msixTargetRoot 'package'))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $frontendRoot 'dist\msix'))
$cargoCommand = Get-Command cargo.exe -ErrorAction SilentlyContinue
$cargoPath = if ($cargoCommand) {
  $cargoCommand.Source
}
else {
  Join-Path ([Environment]::GetFolderPath('UserProfile')) '.cargo\bin\cargo.exe'
}
if (-not (Test-Path -LiteralPath $cargoPath -PathType Leaf)) {
  throw 'No se encontro cargo.exe. Instala Rust o agrega .cargo\bin al PATH.'
}

$tauriConfig = Get-Content -Raw -LiteralPath $tauriConfigPath | ConvertFrom-Json
$storeIdentity = Get-Content -Raw -LiteralPath $identityPath | ConvertFrom-Json
$baseVersion = ($tauriConfig.version -split '-', 2)[0]
$versionParts = @($baseVersion.Split('.'))
if ($versionParts.Count -gt 4) {
  throw "La version '$baseVersion' tiene mas de cuatro componentes."
}
while ($versionParts.Count -lt 4) {
  $versionParts += '0'
}
$msixVersion = $versionParts -join '.'

if (-not $SkipBuild) {
  Push-Location $frontendRoot
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      throw "La compilacion del frontend fallo con codigo $LASTEXITCODE."
    }

    & $cargoPath build --release --manifest-path $tauriConfigPath.Replace('tauri.conf.json', 'Cargo.toml')
    if ($LASTEXITCODE -ne 0) {
      throw "La compilacion de Tauri fallo con codigo $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $releaseExe -PathType Leaf)) {
  throw "No se encontro el ejecutable release: $releaseExe"
}

New-Item -ItemType Directory -Force -Path $msixTargetRoot | Out-Null
if (Test-Path -LiteralPath $stageRoot) {
  $resolvedStage = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $stageRoot).Path)
  if (-not $resolvedStage.StartsWith($msixTargetRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "La carpeta temporal esta fuera de target/msix: $resolvedStage"
  }
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}

$assetsRoot = Join-Path $stageRoot 'Assets'
New-Item -ItemType Directory -Force -Path $assetsRoot | Out-Null
Copy-Item -LiteralPath $releaseExe -Destination (Join-Path $stageRoot 'mysic.exe')

$assetNames = @(
  'StoreLogo.png',
  'Square44x44Logo.png',
  'Square150x150Logo.png'
)
foreach ($assetName in $assetNames) {
  Copy-Item -LiteralPath (Join-Path $iconsRoot $assetName) -Destination (Join-Path $assetsRoot $assetName)
}

$manifest = Get-Content -Raw -LiteralPath $manifestTemplatePath
$manifest = $manifest.Replace('__IDENTITY_NAME__', [string]$storeIdentity.name)
$manifest = $manifest.Replace('__PUBLISHER__', [string]$storeIdentity.publisher)
$manifest = $manifest.Replace('__PUBLISHER_DISPLAY_NAME__', [string]$storeIdentity.publisherDisplayName)
$manifest = $manifest.Replace('__VERSION__', $msixVersion)
[IO.File]::WriteAllText(
  (Join-Path $stageRoot 'AppxManifest.xml'),
  $manifest,
  [Text.UTF8Encoding]::new($false)
)

$makeAppx = Get-ChildItem -LiteralPath 'C:\Program Files (x86)\Windows Kits\10\bin' -Filter 'makeappx.exe' -Recurse |
  Where-Object { $_.Directory.Name -eq 'x64' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $makeAppx) {
  throw 'No se encontro makeappx.exe en Windows SDK.'
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$outputPath = Join-Path $outputRoot "Mysic_${msixVersion}_x64.msix"
& $makeAppx.FullName pack /v /o /h SHA256 /d $stageRoot /p $outputPath
if ($LASTEXITCODE -ne 0) {
  throw "MakeAppx fallo con codigo $LASTEXITCODE."
}

$packageStream = [IO.File]::OpenRead($outputPath)
try {
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $packageHash = ([BitConverter]::ToString($sha256.ComputeHash($packageStream))).Replace('-', '')
  }
  finally {
    $sha256.Dispose()
  }
}
finally {
  $packageStream.Dispose()
}
$packageSize = (Get-Item -LiteralPath $outputPath).Length
Write-Output "MSIX=$outputPath"
Write-Output "VERSION=$msixVersion"
Write-Output "PRODUCT_ID=$($storeIdentity.productId)"
Write-Output "BYTES=$packageSize"
Write-Output "SHA256=$packageHash"
