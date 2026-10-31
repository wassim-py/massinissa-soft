@echo off
setlocal EnableExtensions
title Installation du Pont ZKTeco K50 Pro - Massinissa Academy
color 0B
cd /d "%~dp0"

echo ======================================================================
echo   MASSINISSA ACADEMY - INSTALLATION DU PONT ZKTECO K50 PRO (v4.3)
echo   Support Multi-Lecteurs (1, 2 ou plusieurs K50 Pro) + Multi-Branches
echo ======================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERREUR] Node.js n est pas installe sur cet ordinateur !
    echo Veuillez installer Node.js ^(version LTS^) depuis https://nodejs.org/
    echo.
    pause
    exit /b 1
)

set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"

if exist "%~dp0zk-bridge.js" (
    echo [1/4] Copie de zk-bridge.js depuis ce dossier ^(USB / local^)...
    copy /Y "%~dp0zk-bridge.js" "%BRIDGE_DIR%\zk-bridge.js" >nul
) else (
    echo [1/4] Telechargement de zk-bridge.js depuis GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/wassim-py/massinissa-soft/main/zk-bridge/zk-bridge.js' -OutFile (Join-Path $env:USERPROFILE 'MassinissaK50Bridge\zk-bridge.js')"
)

if not exist "%BRIDGE_DIR%\zk-bridge.js" (
    color 0C
    echo [ERREUR] Impossible de trouver zk-bridge.js !
    pause
    exit /b 1
)

echo [2/4] Arret de toute ancienne version en cours...
node "%BRIDGE_DIR%\zk-bridge.js" --stop

echo [3/4] Configuration de la Branche et des Lecteurs K50 Pro...
node "%BRIDGE_DIR%\zk-bridge.js" --setup

echo.
echo [4/4] Demarrage du service ZKTeco K50 Pro en arriere-plan...
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
