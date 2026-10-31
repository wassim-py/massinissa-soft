@echo off
title Arret du Pont Biometrique ZKTeco K50 Pro
color 0C
echo ============================================================================
echo   MASSINISSA ACADEMY - ARRET DU PONT LOCAL ZKTECO K50 PRO
echo ============================================================================
echo.
echo Arret du service en cours...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo [OK] Le pont local K50 Pro a ete arrete.
ping -n 3 127.0.0.1 >nul
