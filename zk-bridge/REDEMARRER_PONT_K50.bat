@echo off
chcp 65001 >nul
title Redémarrage du Pont Biométrique ZKTeco K50 Pro
color 0B
echo ============================================================================
echo   MASSINISSA ACADEMY — REDÉMARRAGE DU PONT LOCAL ZKTECO K50 PRO
echo ============================================================================
echo.
echo Arrêt de l'instance en cours...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" 2>nul
timeout /t 1 >nul
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaK50Bridge.vbs"
if exist "%STARTUP_VBS%" (
    wscript.exe "%STARTUP_VBS%"
) else (
    start "" /b node "%USERPROFILE%\MassinissaK50Bridge\zk-bridge.js"
)
timeout /t 2 >nul
echo [OK] Le pont local K50 Pro a été redémarré avec succès.
timeout /t 3
