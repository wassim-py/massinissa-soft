@echo off
chcp 65001 >nul
title Arret du Pont Biometrique ZKTeco K50 Pro
echo Arret du service local ZKTeco K50 Pro en cours...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | Invoke-CimMethod -MethodName Terminate | Out-Null" 2>nul
wmic process where "name='node.exe' and commandline like '%%zk-bridge.js%%'" call terminate >nul 2>nul
echo [OK] Le pont local K50 Pro a ete arrete.
pause
