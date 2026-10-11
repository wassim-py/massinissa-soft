@echo off
chcp 65001 >nul
title Installation du Pont Biometrique ZKTeco K50 Pro - Massinissa Academy
color 0B

echo ============================================================================
echo   MASSINISSA ACADEMY - INSTALLATION DU PONT LOCAL ZKTECO K50 PRO (1 CLIC)
echo ============================================================================
echo.

:: 1. Verifier que Node.js est installe sur le PC de l'ecole
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERREUR] Node.js n'est pas installe sur ce PC !
    echo Veuillez installer Node.js LTS depuis https://nodejs.org puis relancer ce fichier.
    echo.
    pause
    exit /b 1
)

:: 2. Creer le dossier permanent sur le PC de l'ecole
set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"

copy /Y "%~dp0zk-bridge.js" "%BRIDGE_DIR%\zk-bridge.js" >nul
echo [OK] Fichier zk-bridge.js installe dans : %BRIDGE_DIR%

:: 3. Demander les adresses IP des lecteurs K50 Pro (par defaut 192.168.50.201)
set "DEVICE_IPS=192.168.50.201"
echo.
echo Par defaut, le lecteur K50 Pro utilise l'adresse IP : 192.168.50.201
echo (Si vous avez 2 lecteurs sur ce PC via un Switch, tapez : 192.168.50.201,192.168.50.202)
set /p UserIPs="Appuyez sur [ENTREE] pour garder 192.168.50.201 (ou saisissez les IPs) : "
if not "%UserIPs%"=="" set "DEVICE_IPS=%UserIPs%"

:: 4. Ouvrir les ports dans le Pare-feu Windows (si execute en Administrateur)
netsh advfirewall firewall add rule name="ZKTeco K50 Pro TCP 4370" dir=in action=allow protocol=TCP localport=4370 >nul 2>nul
netsh advfirewall firewall add rule name="ZKTeco K50 Pro TCP 4370 Out" dir=out action=allow protocol=TCP remoteport=4370 >nul 2>nul
netsh advfirewall firewall add rule name="Massinissa K50 Local Bridge 4375" dir=in action=allow protocol=TCP localport=4375 >nul 2>nul
echo [OK] Regles du Pare-feu Windows configurees (Ports 4370 et 4375).

:: 5. Creer le lanceur silencieux au demarrage de Windows (Startup)
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaK50Bridge.vbs"
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run "cmd /c node ""%BRIDGE_DIR%\zk-bridge.js"" --ips=%DEVICE_IPS%", 0, False
) > "%STARTUP_VBS%"

echo [OK] Demarrage automatique silencieux active au demarrage de Windows !
echo      Emplacement : %STARTUP_VBS%

:: 6. Arreter toute ancienne instance et lancer le pont immediatement en arriere-plan
wmic process where "name='node.exe' and commandline like '%%zk-bridge.js%%'" call terminate >nul 2>nul
wscript.exe "%STARTUP_VBS%"

echo.
echo ============================================================================
echo   INSTALLATION TERMINEE AVEC SUCCES !
echo   - Le Pont ZKTeco K50 Pro tourne maintenant en arriere-plan (127.0.0.1:4375)
echo   - Lecteur(s) configure(s) : %DEVICE_IPS%:4370
echo   - Il demarrera automatiquement chaque matin a l'allumage du PC.
echo   - Ouvrez votre application en ligne : le voyant vert "Connecte" s'allumera !
echo ============================================================================
echo.
pause
