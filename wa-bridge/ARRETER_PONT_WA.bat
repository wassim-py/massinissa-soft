@echo off
setlocal EnableExtensions
title Arret du Pont WhatsApp - Massinissa School
color 0E
cd /d "%~dp0"

echo ======================================================================
echo   ARRET DU PONT WHATSAPP EN ARRIERE-PLAN
echo ======================================================================
echo.

set "BRIDGE_DIR=%USERPROFILE%\MassinissaWhatsAppBridge"
if exist "%BRIDGE_DIR%\wa-bridge.js" (
    node "%BRIDGE_DIR%\wa-bridge.js" --stop
) else if exist "%~dp0wa-bridge.js" (
    node "%~dp0wa-bridge.js" --stop
)

echo.
echo Pour le relancer, utilisez INSTALLER_ET_DEMARRER_PONT_WA.bat.
echo.
pause
