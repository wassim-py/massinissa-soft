@echo off
setlocal EnableExtensions
title Installation du Pont WhatsApp Autonome - Massinissa School
color 0A
cd /d "%~dp0"

echo ======================================================================
echo   MASSINISSA SCHOOL - INSTALLATION DU PONT WHATSAPP AUTONOME (v2.0)
echo   Zero Code Source sur ce PC - Synchronisation Cloud Automatique
echo ======================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERREUR] Node.js n est pas installe sur cet ordinateur !
    echo Veuillez installer Node.js LTS ^(v20 ou v22^) depuis https://nodejs.org/
    echo.
    pause
    exit /b 1
)

set "BRIDGE_DIR=%USERPROFILE%\MassinissaWhatsAppBridge"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"

echo [1/5] Copie des fichiers du pont autonome vers %BRIDGE_DIR%...
copy /Y "%~dp0wa-bridge.js" "%BRIDGE_DIR%\wa-bridge.js" >nul
copy /Y "%~dp0package.json" "%BRIDGE_DIR%\package.json" >nul

echo [2/5] Arret de toute ancienne instance en cours...
if exist "%BRIDGE_DIR%\node_modules\@whiskeysockets\baileys" (
    node "%BRIDGE_DIR%\wa-bridge.js" --stop
)

echo [3/5] Installation des composants WhatsApp legers ^(1ere fois : ~30s^)...
pushd "%BRIDGE_DIR%"
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
    popd
    color 0C
    echo [ERREUR] Echec de npm install. Verifiez votre connexion Internet.
    pause
    exit /b 1
)

echo.
echo [4/5] Configuration de la connexion Cloud Vercel...
node "%BRIDGE_DIR%\wa-bridge.js" --setup

echo.
echo [5/5] Demarrage silencieux du Pont WhatsApp en arriere-plan...
set "VBS_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaWhatsAppBridge.vbs"
if exist "%VBS_FILE%" (
    wscript.exe "%VBS_FILE%"
) else (
    start "" /b node "%BRIDGE_DIR%\wa-bridge.js"
)

echo Initialisation de la session WhatsApp et synchronisation Cloud ^(6 secondes^)...
timeout /t 6 /nobreak >nul
echo.
node "%BRIDGE_DIR%\wa-bridge.js" --diag
popd
echo.
echo Termine ! Ouvrez maintenant Configuration ^> WhatsApp sur le site pour scanner le QR Code.
echo.
pause
