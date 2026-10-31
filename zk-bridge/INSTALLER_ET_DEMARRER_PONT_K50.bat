@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Installation du Pont Biométrique ZKTeco K50 Pro — Massinissa Academy
color 0B

echo ============================================================================
echo   MASSINISSA ACADEMY — INSTALLATEUR DU PONT LOCAL ZKTECO K50 PRO (v4.2)
echo   (Multi-Lecteurs, Synchronisation Multi-Branches & Support LCD)
echo ============================================================================
echo.

:: 1. Vérification de Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ATTENTION] Node.js n'est pas installé sur ce PC !
    echo.
    echo Voulez-vous télécharger et installer Node.js automatiquement ?
    set /p InstallNode="Appuyez sur [ENTREE] pour installer Node.js (ou 'N' pour annuler) : "
    if /i "!InstallNode!"=="N" (
        echo Veuillez installer Node.js LTS manuellement depuis https://nodejs.org
        pause
        exit /b 1
    )
    echo Téléchargement de Node.js LTS en cours...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi', '$env:TEMP\node_installer.msi')"
    echo Lancement de l'installateur Node.js... Veuillez suivre les étapes à l'écran.
    msiexec /i "%TEMP%\node_installer.msi"
    del "%TEMP%\node_installer.msi" 2>nul
    echo.
    echo Une fois l'installation de Node.js terminée, fermez cette fenêtre et relancez ce fichier .bat !
    pause
    exit /b 0
)

:: 2. Dossier permanent sur le PC
set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"

:: 3. Détecter la configuration existante si présente
set "EXISTING_IPS=192.168.50.201"
set "EXISTING_BRANCH=1"
if exist "%BRIDGE_DIR%\bridge_config.json" (
    for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "try { $c = Get-Content '%BRIDGE_DIR%\bridge_config.json' -Raw | ConvertFrom-Json; Write-Host $c.deviceIps; } catch {}"`) do (
        if not "%%A"=="" set "EXISTING_IPS=%%A"
    )
    for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "try { $c = Get-Content '%BRIDGE_DIR%\bridge_config.json' -Raw | ConvertFrom-Json; Write-Host $c.branchId; } catch {}"`) do (
        if not "%%A"=="" set "EXISTING_BRANCH=%%A"
    )
)

echo ----------------------------------------------------------------------------
echo  ÉTAPE 1 / 3 : SÉLECTION DU SITE / BRANCHE DE L'ÉCOLE
echo ----------------------------------------------------------------------------
echo Ce PC se trouve dans quel site / branche ?
echo   [1] ECOLE
echo   [2] ANNEX
echo   [3] AMPHI
echo.
set "CHOSEN_BRANCH=%EXISTING_BRANCH%"
set /p BranchInput="Tapez 1, 2 ou 3 [Actuel: %EXISTING_BRANCH%] : "
if not "%BranchInput%"=="" set "CHOSEN_BRANCH=%BranchInput%"
if "%CHOSEN_BRANCH%"=="1" set "BRANCH_NAME=ECOLE"
if "%CHOSEN_BRANCH%"=="2" set "BRANCH_NAME=ANNEX"
if "%CHOSEN_BRANCH%"=="3" set "BRANCH_NAME=AMPHI"
echo [OK] Site sélectionné : Branche #%CHOSEN_BRANCH% (%BRANCH_NAME%)
echo.

echo ----------------------------------------------------------------------------
echo  ÉTAPE 2 / 3 : ADRESSES IP DES LECTEURS ZKTECO K50 PRO
echo ----------------------------------------------------------------------------
echo Adresse(s) IP actuellement configurée(s) : %EXISTING_IPS%
echo.
echo   - Pour 1 seul lecteur      : 192.168.50.201
echo   - Pour 2 lecteurs (Switch) : 192.168.50.201,192.168.50.202
echo.
set "DEVICE_IPS=%EXISTING_IPS%"
set /p UserIPs="Appuyez sur [ENTREE] pour conserver (%EXISTING_IPS%) ou entrez les IPs : "
if not "%UserIPs%"=="" set "DEVICE_IPS=%UserIPs%"
echo [OK] Lecteur(s) configuré(s) : %DEVICE_IPS%
echo.

echo ----------------------------------------------------------------------------
echo  ÉTAPE 3 / 3 : INSTALLATION ET MISE À JOUR DU FICHIER PONT (zk-bridge.js)
echo ----------------------------------------------------------------------------
:: Si zk-bridge.js est dans le même dossier que ce .bat, on le copie en priorité
if exist "%~dp0zk-bridge.js" (
    copy /Y "%~dp0zk-bridge.js" "%BRIDGE_DIR%\zk-bridge.js" >nul
    echo [OK] Fichier zk-bridge.js local copié vers %BRIDGE_DIR%
) else (
    echo [INFO] Fichier zk-bridge.js non trouvé localement.
    echo Téléchargement direct de la dernière version depuis GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object Net.WebClient; $wc.Headers.Add('Cache-Control', 'no-cache'); $wc.DownloadFile('https://raw.githubusercontent.com/wassim-py/massinissa-soft/main/zk-bridge/zk-bridge.js?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), '%BRIDGE_DIR%\zk-bridge.js')"
    if exist "%BRIDGE_DIR%\zk-bridge.js" (
        echo [OK] Dernière version de zk-bridge.js téléchargée depuis GitHub avec succès !
    ) else (
        color 0C
        echo [ERREUR] Impossible de télécharger zk-bridge.js. Vérifiez votre connexion Internet.
        pause
        exit /b 1
    )
)

:: 4. Écriture / Sauvegarde de bridge_config.json
powershell -NoProfile -ExecutionPolicy Bypass -Command "$cfg = @{ deviceIps = '%DEVICE_IPS%'; branchId = [int]%CHOSEN_BRANCH%; isBranchExplicitlySet = $true; updatedAt = (Get-Date).ToString('o') }; $cfg | ConvertTo-Json | Set-Content '%BRIDGE_DIR%\bridge_config.json' -Encoding UTF8"

:: 5. Désactiver la mise en veille Ethernet (Anti-déconnexion après inactivité)
echo Configuration de la carte réseau (Désactivation veille Ethernet)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-NetAdapterAdvancedProperty -Name 'Ethernet*' -RegistryKeyword 'PowerSavingMode' -RegistryValue 0 -ErrorAction SilentlyContinue; Set-NetAdapterAdvancedProperty -Name 'Ethernet*' -RegistryKeyword 'EnableGreenEthernet' -RegistryValue 0 -ErrorAction SilentlyContinue; Set-NetAdapterAdvancedProperty -Name 'Ethernet*' -RegistryKeyword '*EEE' -RegistryValue 0 -ErrorAction SilentlyContinue; Disable-NetAdapterPowerManagement -Name 'Ethernet*' -ErrorAction SilentlyContinue" >nul 2>nul
echo [OK] Mise en veille réseau désactivée.

:: 6. Pare-feu Windows
netsh advfirewall firewall add rule name="ZKTeco K50 Pro TCP 4370" dir=in action=allow protocol=TCP localport=4370 >nul 2>nul
netsh advfirewall firewall add rule name="ZKTeco K50 Pro TCP 4370 Out" dir=out action=allow protocol=TCP remoteport=4370 >nul 2>nul
netsh advfirewall firewall add rule name="Massinissa K50 Local Bridge 4375" dir=in action=allow protocol=TCP localport=4375 >nul 2>nul
echo [OK] Ports 4370 et 4375 autorisés dans le Pare-feu Windows.

:: 7. Création du lanceur au démarrage automatique Windows (VBS silencieux)
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaK50Bridge.vbs"
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run "cmd /c node ""%BRIDGE_DIR%\zk-bridge.js"" --ips=%DEVICE_IPS% --branch=%CHOSEN_BRANCH%", 0, False
) > "%STARTUP_VBS%"
echo [OK] Démarrage automatique silencieux activé dans le dossier Startup Windows.

:: 8. Arrêt de toute ancienne instance et démarrage propre
echo Redémarrage du service local...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
timeout /t 1 >nul
wscript.exe "%STARTUP_VBS%"
timeout /t 2 >nul

:: 9. Test de connectivité automatique
echo.
echo ============================================================================
echo   TEST DE CONNECTIVITÉ AVEC LES LECTEURS ET LE PONT
echo ============================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ips = '%DEVICE_IPS%'.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }; foreach ($ip in $ips) { try { $client = New-Object System.Net.Sockets.TcpClient; $ar = $client.BeginConnect($ip, 4370, $null, $null); $wait = $ar.AsyncWaitHandle.WaitOne(1500, $false); if ($wait -and $client.Connected) { $client.EndConnect($ar); $client.Close(); Write-Host ('  [✓ EN LIGNE] Lecteur ' + $ip + ':4370 joignable avec succès !') -ForegroundColor Green } else { $client.Close(); Write-Host ('  [✗ HORS LIGNE] Lecteur ' + $ip + ':4370 injoignable ! Vérifiez câble, switch ou IP.') -ForegroundColor Red } } catch { Write-Host ('  [✗ ERREUR] Lecteur ' + $ip + ':4370 injoignable (' + $_.Exception.Message + ')') -ForegroundColor Red } }; try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:4375/status' -TimeoutSec 2 -ErrorAction Stop; Write-Host ('  [✓ ACTIF] Pont Local en écoute sur 127.0.0.1:4375 (Branche #' + $res.branchId + ', ' + $res.devices.Count + ' lecteur(s) enregistrés)') -ForegroundColor Green } catch { Write-Host '  [!] Le pont local démarre en arrière-plan...' -ForegroundColor Yellow }"

echo.
echo ============================================================================
echo   INSTALLATION TERMINÉE AVEC SUCCÈS !
echo   - Site de l'école : Branche #%CHOSEN_BRANCH% (%BRANCH_NAME%)
echo   - Lecteurs K50 Pro : %DEVICE_IPS%
echo   - Service actif en arrière-plan sur http://127.0.0.1:4375
echo   - Démarrage automatique garanti à chaque allumage du PC.
echo ============================================================================
echo.
pause
