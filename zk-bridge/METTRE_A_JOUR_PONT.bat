@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Mise à jour du Pont Biométrique ZKTeco K50 Pro — Massinissa Academy
color 0B

echo ============================================================================
echo   MASSINISSA ACADEMY — MISE À JOUR DU PONT LOCAL ZKTECO K50 PRO
echo ============================================================================
echo.

set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"

:: 1. Détecter la configuration existante
set "SAVED_IPS=192.168.50.201"
set "SAVED_BRANCH=1"
if exist "%BRIDGE_DIR%\bridge_config.json" (
    for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "try { $c = Get-Content '%BRIDGE_DIR%\bridge_config.json' -Raw | ConvertFrom-Json; Write-Host $c.deviceIps; } catch {}"`) do (
        if not "%%A"=="" set "SAVED_IPS=%%A"
    )
    for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "try { $c = Get-Content '%BRIDGE_DIR%\bridge_config.json' -Raw | ConvertFrom-Json; Write-Host $c.branchId; } catch {}"`) do (
        if not "%%A"=="" set "SAVED_BRANCH=%%A"
    )
)
echo [CONFIG DÉTECTÉE] Site / Branche : #%SAVED_BRANCH% | Lecteur(s) : %SAVED_IPS%
echo.

:: 2. Arrêt propre du service en cours
echo [1/3] Arrêt du pont en cours d'exécution...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
timeout /t 1 >nul

:: 3. Téléchargement de la dernière version
echo [2/3] Téléchargement de la dernière version de zk-bridge.js depuis GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object Net.WebClient; $wc.Headers.Add('Cache-Control', 'no-cache'); $wc.DownloadFile('https://raw.githubusercontent.com/wassim-py/massinissa-soft/main/zk-bridge/zk-bridge.js?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), '%BRIDGE_DIR%\zk-bridge.js')" 2>nul

if not exist "%BRIDGE_DIR%\zk-bridge.js" (
    if exist "%~dp0zk-bridge.js" (
        copy /Y "%~dp0zk-bridge.js" "%BRIDGE_DIR%\zk-bridge.js" >nul
        echo [INFO] Téléchargement GitHub échoué, fichier zk-bridge.js local copié.
    ) else (
        color 0C
        echo [ERREUR] Échec du téléchargement. Vérifiez votre connexion Internet.
        pause
        exit /b 1
    )
) else (
    echo [OK] Dernière version de zk-bridge.js téléchargée avec succès !
)

:: 4. Mettre à jour le script de démarrage Startup VBS
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaK50Bridge.vbs"
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run "cmd /c node ""%BRIDGE_DIR%\zk-bridge.js"" --ips=%SAVED_IPS% --branch=%SAVED_BRANCH%", 0, False
) > "%STARTUP_VBS%"

:: 5. Relancer le pont
echo [3/3] Redémarrage du pont en arrière-plan...
wscript.exe "%STARTUP_VBS%"
timeout /t 2 >nul

:: 6. Vérification du statut
echo.
echo ============================================================================
echo   VÉRIFICATION DU STATUT DU PONT
echo ============================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:4375/status' -TimeoutSec 3 -ErrorAction Stop; Write-Host ('  [✓ ACTIF] Pont en ligne sur 127.0.0.1:4375') -ForegroundColor Green; Write-Host ('  [✓ BRANCHE] Branche #' + $res.branchId) -ForegroundColor Green; Write-Host ('  [✓ LECTEURS] ' + $res.deviceIp + ' (Connecté: ' + $res.connected + ')') -ForegroundColor Green; foreach ($d in $res.devices) { $st = if ($d.connected) { 'EN LIGNE' } else { 'CONNEXION EN COURS / HORS LIGNE' }; $color = if ($d.connected) { 'Green' } else { 'Yellow' }; Write-Host ('     -> Lecteur ' + $d.ip + ' : ' + $st) -ForegroundColor $color } } catch { Write-Host '  [!] Le pont démarre en arrière-plan...' -ForegroundColor Yellow }"

echo.
echo [OK] Mise à jour terminée avec succès !
echo.
timeout /t 6
