@echo off
setlocal EnableExtensions
title Diagnostic du Pont WhatsApp - Massinissa School
color 0B
cd /d "%~dp0"

set "BRIDGE_DIR=%USERPROFILE%\MassinissaWhatsAppBridge"
if exist "%BRIDGE_DIR%\wa-bridge.js" (
    node "%BRIDGE_DIR%\wa-bridge.js" --diag
    echo.
    if exist "%BRIDGE_DIR%\wa-bridge.log" (
        echo --- Dernieres lignes du journal ^(wa-bridge.log^) ---
        powershell -NoProfile -Command "Get-Content -Tail 20 (Join-Path $env:USERPROFILE 'MassinissaWhatsAppBridge\wa-bridge.log')"
    )
) else (
    echo [INFO] Le pont n est pas encore installe dans %BRIDGE_DIR%.
    echo Lancez d abord INSTALLER_ET_DEMARRER_PONT_WA.bat.
)
echo.
pause
