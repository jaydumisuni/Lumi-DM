param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [string]$OutputRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "artifacts\packaged-windows-proof")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path $Root).Path
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$Stage = Join-Path $OutputRoot "stage"
$ServerDist = Join-Path $OutputRoot "server"
$ServerWork = Join-Path $OutputRoot "pyinstaller-work"
$ServerSpec = Join-Path $OutputRoot "pyinstaller-spec"
$PackageOutput = Join-Path $OutputRoot "electron-dist"

Remove-Item -Recurse -Force $OutputRoot -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Stage, $ServerDist, $ServerWork, $ServerSpec, $PackageOutput | Out-Null

$requiredSource = @(
  "electron\main.js",
  "electron\browser-extension-source.js",
  "static\index.html",
  "static\favicon-256.png",
  "browser-extension\manifest.json",
  "browser-extension\media-quality-picker.js",
  "browser-extension\media-quality-bridge.js",
  "Resouces\download manager logo.png",
  "assets\windows\Lumi-DM.ico",
  "server.py"
)
foreach ($relative in $requiredSource) {
  $candidate = Join-Path $Root $relative
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "Required Lumi proof source is missing: $relative"
  }
}
if (Test-Path -LiteralPath (Join-Path $Root "static\browser-extension\chromium")) {
  throw "Duplicate static Chromium extension must be removed before packaging"
}

Write-Host "Building actual LUMIDM-server.exe from the reviewed Python source..."
python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --noconsole `
  --name LUMIDM-server `
  --distpath $ServerDist `
  --workpath $ServerWork `
  --specpath $ServerSpec `
  --paths $Root `
  --collect-submodules core `
  --collect-all yt_dlp `
  --collect-all cryptography `
  --collect-all psutil `
  (Join-Path $Root "server.py")

$ServerExe = Join-Path $ServerDist "LUMIDM-server.exe"
if (-not (Test-Path -LiteralPath $ServerExe -PathType Leaf)) {
  throw "PyInstaller did not produce LUMIDM-server.exe"
}

Copy-Item -Recurse -Force (Join-Path $Root "electron") (Join-Path $Stage "electron")

$package = @{
  name = "lumi-dm-packaged-proof"
  version = "1.0.0-proof"
  private = $true
  main = "electron/main.js"
  description = "Internal packaged proof candidate for Lumi DM"
  author = "THETECHGUY DIGITAL SOLUTIONS"
  devDependencies = @{
    electron = "29.4.6"
    "electron-builder" = "24.13.3"
  }
} | ConvertTo-Json -Depth 8
Set-Content -LiteralPath (Join-Path $Stage "package.json") -Value $package -Encoding UTF8

$escapedRoot = $Root.Replace("\", "\\").Replace("'", "\'")
$escapedServer = $ServerDist.Replace("\", "\\").Replace("'", "\'")
$escapedOutput = $PackageOutput.Replace("\", "\\").Replace("'", "\'")
$config = @"
const path = require('path');
module.exports = {
  appId: 'com.lumi.dm.proof',
  productName: 'Lumi DM',
  executableName: 'Lumi-DM',
  asar: true,
  directories: { output: '$escapedOutput' },
  files: ['electron/**/*', 'package.json'],
  extraResources: [
    { from: '$escapedRoot\\static', to: 'static' },
    { from: '$escapedRoot\\browser-extension', to: 'browser-extension' },
    { from: '$escapedRoot\\Resouces', to: 'Resouces' },
    { from: '$escapedServer', to: 'server', filter: ['LUMIDM-server.exe'] }
  ],
  win: {
    target: [{ target: 'dir', arch: ['x64'] }],
    icon: '$escapedRoot\\assets\\windows\\Lumi-DM.ico',
    artifactName: 'Lumi-DM-proof-${version}.${ext}'
  }
};
"@
Set-Content -LiteralPath (Join-Path $Stage "electron-builder.config.cjs") -Value $config -Encoding UTF8

Push-Location $Stage
try {
  npm install --no-audit --no-fund
  npx electron-builder --dir --win x64 --config electron-builder.config.cjs
} finally {
  Pop-Location
}

$PackagedExe = Join-Path $PackageOutput "win-unpacked\Lumi-DM.exe"
if (-not (Test-Path -LiteralPath $PackagedExe -PathType Leaf)) {
  throw "electron-builder did not produce the packaged Lumi executable"
}

$resources = Join-Path $PackageOutput "win-unpacked\resources"
foreach ($relative in @(
  "app.asar",
  "static\index.html",
  "static\favicon-256.png",
  "browser-extension\manifest.json",
  "browser-extension\media-quality-picker.js",
  "browser-extension\media-quality-bridge.js",
  "Resouces\download manager logo.png",
  "server\LUMIDM-server.exe"
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $resources $relative) -PathType Leaf)) {
    throw "Packaged Lumi resource is missing: $relative"
  }
}
if (Test-Path -LiteralPath (Join-Path $resources "static\browser-extension\chromium")) {
  throw "Packaged Lumi contains the removed duplicate extension"
}

$proof = @{
  executable = $PackagedExe
  resources = $resources
  appAsar = Join-Path $resources "app.asar"
  server = Join-Path $resources "server\LUMIDM-server.exe"
  extension = Join-Path $resources "browser-extension"
  canonicalIcon = Join-Path $resources "static\favicon-256.png"
} | ConvertTo-Json -Depth 4
$ProofFile = Join-Path $OutputRoot "packaged-proof.json"
Set-Content -LiteralPath $ProofFile -Value $proof -Encoding UTF8
Write-Host "LUMI_PACKAGED_EXE=$PackagedExe"
Write-Host "LUMI_PACKAGED_PROOF=$ProofFile"
