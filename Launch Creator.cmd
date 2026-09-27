@echo off
cd /d "%~dp0"
if exist "release\v0.1.17\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.17\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.16\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.16\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.15\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.15\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.14\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.14\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.13\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.13\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.12\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.12\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.11\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.11\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.10\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.10\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.9\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.9\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.8\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.8\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.7\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.7\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.6\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.6\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.5\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.5\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.4\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.4\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.3\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.3\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\v0.1.2\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\v0.1.2\win-unpacked\Choicer Voicer Creator.exe"
  exit /b 0
)
if exist "release\win-unpacked\Choicer Voicer Creator.exe" (
  start "" "release\win-unpacked\Choicer Voicer Creator.exe"
) else (
  if not exist "node_modules\electron\dist\electron.exe" (
    echo Run npm install and npm run build first. See README.md.
    pause
    exit /b 1
  )
  start "" "node_modules\electron\dist\electron.exe" .
)
