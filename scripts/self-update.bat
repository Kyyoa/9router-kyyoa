@echo off
REM 9router-kyyoa self-update (Windows) — klik "Copy & Shutdown" di dashboard, paste, Enter.
REM Urutan: cek repo -> backup DB -> pull -> install -> build -> restart -> verifikasi.
setlocal EnableDelayedExpansion

set "REPO_DIR=%~dp0.."
cd /d "%REPO_DIR%" || ( echo [X] Gagal masuk %REPO_DIR% & exit /b 1 )
if "%PORT%"=="" set PORT=20130

echo [1/6] Cek repo...
if not exist "custom-server.js" ( echo [X] Bukan folder 9router-kyyoa. Jalanin dari folder install kamu. & exit /b 1 )
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 ( echo [X] Bukan repo git — update manual. & exit /b 1 )

echo [2/6] Backup DB...
if "%DATA_DIR%"=="" set "DATA_DIR=%APPDATA%\9router"
if exist "%DATA_DIR%\db\data.sqlite" (
  if not exist "%DATA_DIR%\db\backups" mkdir "%DATA_DIR%\db\backups"
  for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%t
  copy /y "%DATA_DIR%\db\data.sqlite" "%DATA_DIR%\db\backups\data-pre-update-!TS!.sqlite" >nul
  if errorlevel 1 ( echo [X] Backup DB gagal. Update dibatalkan biar data aman. & exit /b 1 )
  echo [OK] DB dibackup: data-pre-update-!TS!.sqlite
) else (
  echo [-] DB belum ada — fresh install, lewati backup.
)

echo [3/6] git pull...
git rev-parse --abbrev-ref --symbolic-full-name @{u} >nul 2>&1
if errorlevel 1 (
  git pull --ff-only origin master
) else (
  git pull --ff-only
)
if errorlevel 1 ( echo [X] git pull gagal (repo lokal ada perubahan). Rapikan dulu: git status & exit /b 1 )

echo [4/6] npm install...
call npm install
if errorlevel 1 ( echo [X] npm install gagal. & exit /b 1 )

echo [5/6] npm run build (tunggu, beberapa menit)...
call npm run build
if errorlevel 1 ( echo [X] npm run build gagal. Server lama masih jalan, lapor ke Kyyoa. & exit /b 1 )

echo [6/6] Restart server port %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo     Matikan PID %%p...
  taskkill /F /PID %%p >nul 2>&1
)
timeout /t 3 /nobreak >nul
set "NODE_OPTIONS=--max-http-header-size=65536"
start /min "9router-kyyoa" cmd /c "node custom-server.js --port %PORT% >> %TEMP%\9router-kyyoa.log 2>&1"
echo [OK] Server baru dijalankan.

echo Verifikasi (maks 60 detik)...
for /l %%i in (1,1,30) do (
  powershell -NoProfile -Command "try { (Invoke-RestMethod 'http://127.0.0.1:%PORT%/api/version' -TimeoutSec 5).currentVersion } catch { '' }" > "%TEMP%\9r-ver.txt" 2>nul
  set /p VER=<"%TEMP%\9r-ver.txt"
  if not "!VER!"=="" (
    echo.
    echo [OK] Server jawab. Versi jalan: !VER!
    echo     Buka dashboard lagi — sidebar harusnya nunjukin versi baru.
    exit /b 0
  )
  timeout /t 2 /nobreak >nul
)
echo [X] Server tidak jawab /api/version dalam 60 detik.
exit /b 1
