@echo off
title Redemarrage du Pont Biometrique ZKTeco K50 Pro
color 0B
echo ============================================================================
echo   MASSINISSA ACADEMY - REDEMARRAGE DU PONT LOCAL ZKTECO K50 PRO
echo ============================================================================
echo.
echo Arret de l instance en cours...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
ping -n 2 127.0.0.1 >nul
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaK50Bridge.vbs"
if exist "%STARTUP_VBS%" (
    wscript.exe "%STARTUP_VBS%"
) else (
    start "" /b node "%USERPROFILE%\MassinissaK50Bridge\zk-bridge.js"
)
ping -n 2 127.0.0.1 >nul
echo [OK] Le pont local K50 Pro a ete redemarre avec succes.
ping -n 3 127.0.0.1 >nul
