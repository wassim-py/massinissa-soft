@echo off
chcp 65001 >nul
title Arrêt du Pont Biométrique ZKTeco K50 Pro
color 0C
echo ============================================================================
echo   MASSINISSA ACADEMY — ARRÊT DU PONT LOCAL ZKTECO K50 PRO
echo ============================================================================
echo.
echo Arrêt du service en cours...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" 2>nul
echo [OK] Le pont local K50 Pro a été arrêté.
timeout /t 3
