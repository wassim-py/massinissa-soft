@echo off
setlocal EnableExtensions
title Arret du Pont ZKTeco K50 Pro
color 0E
cd /d "%~dp0"

echo ======================================================================
echo   ARRET DU PONT ZKTECO K50 PRO EN ARRIERE-PLAN
echo ======================================================================
echo.

set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if exist "%BRIDGE_DIR%\zk-bridge.js" (
    node "%BRIDGE_DIR%\zk-bridge.js" --stop
) else if exist "%~dp0zk-bridge.js" (
    node "%~dp0zk-bridge.js" --stop
)

echo.
echo Pour le relancer, utilisez INSTALLER_ET_DEMARRER_PONT_K50.bat ou METTRE_A_JOUR_PONT.bat.
echo.
pause
