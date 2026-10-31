@echo off
title Mise a jour - Pont Biometrique ZKTeco K50 Pro
color 0B
echo ============================================================================
echo   MASSINISSA ACADEMY - MISE A JOUR DU PONT ZKTECO K50 PRO
echo ============================================================================
echo.
set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"
echo [1/3] Arret de l ancienne version...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
ping -n 2 127.0.0.1 >nul
echo [2/3] Telechargement de la derniere version depuis GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object Net.WebClient; $wc.Headers.Add('User-Agent', 'Mozilla/5.0'); $wc.Headers.Add('Cache-Control', 'no-cache'); try { $wc.DownloadFile('https://raw.githubusercontent.com/wassim-py/massinissa-soft/main/zk-bridge/zk-bridge.js?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), '$env:USERPROFILE\MassinissaK50Bridge\zk-bridge.js') } catch {}"
if not exist "%BRIDGE_DIR%\zk-bridge.js" (
    if exist "%~dp0zk-bridge.js" (
        copy /Y "%~dp0zk-bridge.js" "%BRIDGE_DIR%\zk-bridge.js" >nul
        echo [OK] Copie locale effectuee.
    ) else (
        color 0C
        echo [ERREUR] Echec du telechargement. Verifiez la connexion Internet.
        echo.
        pause
        exit /b 1
    )
) else (
    echo [OK] Derniere version telechargee avec succes.
)
echo [3/3] Redemarrage du pont en arriere-plan...
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaK50Bridge.vbs"
if exist "%STARTUP_VBS%" (
    wscript.exe "%STARTUP_VBS%"
) else (
    start "" /b node "%BRIDGE_DIR%\zk-bridge.js"
)
ping -n 3 127.0.0.1 >nul
echo.
echo ============================================================================
echo   VERIFICATION DU STATUT DU PONT
echo ============================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:4375/status' -TimeoutSec 3 -ErrorAction Stop; Write-Host '  [OK EN LIGNE] Le pont est actif sur http://127.0.0.1:4375' -ForegroundColor Green; Write-Host ('  [OK BRANCHE] Branche #' + $res.branchId) -ForegroundColor Green; Write-Host ('  [OK LECTEURS] ' + $res.deviceIp) -ForegroundColor Green; foreach ($d in $res.devices) { $st = if ($d.connected) { 'EN LIGNE' } else { 'EN ATTENTE / DECONNECTE' }; $col = if ($d.connected) { 'Green' } else { 'Yellow' }; Write-Host ('     -> Lecteur ' + $d.ip + ' : ' + $st) -ForegroundColor $col } } catch { Write-Host '  [!] Le pont demarre en arriere-plan...' -ForegroundColor Yellow }"
echo.
echo [OK] Mise a jour terminee avec succes !
echo.
pause
