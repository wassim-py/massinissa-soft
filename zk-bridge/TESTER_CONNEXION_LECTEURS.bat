@echo off
setlocal EnableExtensions
title Diagnostic Connexion ZKTeco K50 Pro - Massinissa Academy
color 0B
cd /d "%~dp0"

echo ======================================================================
echo   DIAGNOSTIC DU PONT ZKTECO K50 PRO (PORT LOCAL 4375 ^& LECTEURS 4370)
echo ======================================================================
echo.

set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if exist "%BRIDGE_DIR%\zk-bridge.js" (
    node "%BRIDGE_DIR%\zk-bridge.js" --diag
) else if exist "%~dp0zk-bridge.js" (
    node "%~dp0zk-bridge.js" --diag
) else (
    echo [ERREUR] zk-bridge.js n est pas encore installe sur cet ordinateur.
    echo Lancez INSTALLER_ET_DEMARRER_PONT_K50.bat pour l installer.
)

echo.
pause
