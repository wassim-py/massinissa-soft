@echo off
setlocal EnableExtensions
title Mise a jour du Pont ZKTeco K50 Pro - Massinissa Academy
color 0B
cd /d "%~dp0"

echo ======================================================================
echo   MISE A JOUR RAPIDE DU PONT ZKTECO K50 PRO (v4.3 MULTI-LECTEURS)
echo ======================================================================
echo.

set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"

if exist "%~dp0zk-bridge.js" (
    echo [1/4] Copie de la nouvelle version depuis ce dossier ^(USB / local^)...
    copy /Y "%~dp0zk-bridge.js" "%BRIDGE_DIR%\zk-bridge.js" >nul
) else (
    echo [1/4] Telechargement de la derniere version depuis GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/wassim-py/massinissa-soft/main/zk-bridge/zk-bridge.js' -OutFile (Join-Path $env:USERPROFILE 'MassinissaK50Bridge\zk-bridge.js')"
)

echo [2/4] Arret de l ancienne version en cours...
node "%BRIDGE_DIR%\zk-bridge.js" --stop
timeout /t 1 /nobreak >nul

echo [3/4] Detection automatique de tous les lecteurs K50 Pro sur le reseau...
node "%BRIDGE_DIR%\zk-bridge.js" --auto-config

echo [4/4] Relance du pont K50 Pro en arriere-plan...
set "VBS_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaK50Bridge.vbs"
if exist "%VBS_FILE%" (
    wscript.exe "%VBS_FILE%"
) else (
    start "" /b node "%BRIDGE_DIR%\zk-bridge.js"
)

echo Attente de la connexion aux lecteurs K50 Pro ^(4 secondes^)...
timeout /t 4 /nobreak >nul
echo.
node "%BRIDGE_DIR%\zk-bridge.js" --diag
echo.
pause
