$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Runner = (Resolve-Path (Join-Path $PSScriptRoot "run_git_autosync_windows.cmd")).Path
& git -C $RepoRoot config core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) { throw "Could not configure Git hooks" }
$TaskName = "Lumi Git AutoSync"
$TaskCommand = '"' + $Runner + '"'
& schtasks.exe /Create /TN $TaskName /TR $TaskCommand /SC MINUTE /MO 2 /F | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not create the Lumi auto-sync scheduled task" }
& $Runner
if ($LASTEXITCODE -ne 0) { throw "Initial Lumi auto-sync failed" }
Write-Host "Lumi Git auto-sync installed for $RepoRoot"
