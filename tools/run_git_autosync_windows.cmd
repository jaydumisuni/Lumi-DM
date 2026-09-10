@echo off
setlocal
set "ROOT=%~dp0.."
where py.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py.exe -3 "%~dp0git_autosync.py" --repo "%ROOT%"
  exit /b %ERRORLEVEL%
)
where python.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  python.exe "%~dp0git_autosync.py" --repo "%ROOT%"
  exit /b %ERRORLEVEL%
)
echo Lumi Git auto-sync: Python 3 not found. 1>&2
exit /b 2
