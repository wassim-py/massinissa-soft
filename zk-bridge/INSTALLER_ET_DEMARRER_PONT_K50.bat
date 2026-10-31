@echo off
title Installation du Pont Biometrique ZKTeco K50 Pro - Massinissa Academy
color 0B
echo ============================================================================
echo   MASSINISSA ACADEMY - INSTALLATEUR DU PONT LOCAL ZKTECO K50 PRO
echo   (Support Multi-Lecteurs et Synchronisation Multi-Branches)
echo ============================================================================
echo.
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ATTENTION] Node.js n'est pas installe sur ce PC !
    echo Veuillez installer Node.js LTS depuis https://nodejs.org
    echo.
    pause
    exit /b 1
)
set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"
echo ----------------------------------------------------------------------------
echo  ETAPE 1 / 3 : SITE / BRANCHE DE L ECOLE
echo ----------------------------------------------------------------------------
echo Choisissez la branche de cette ecole :
echo   1 : ECOLE
echo   2 : ANNEX
echo   3 : AMPHI
echo.
choice /C 123 /N /M "Tapez 1, 2 ou 3 : "
if errorlevel 3 (set "BRANCH_ID=3") else if errorlevel 2 (set "BRANCH_ID=2") else (set "BRANCH_ID=1")
echo [OK] Branche selectionnee : #%BRANCH_ID%
echo.
echo ----------------------------------------------------------------------------
echo  ETAPE 2 / 3 : ADRESSES IP DES LECTEURS ZKTECO K50 PRO
echo ----------------------------------------------------------------------------
echo   Pour 1 lecteur           : 192.168.50.201
echo   Pour 2 lecteurs (Switch) : 192.168.50.201,192.168.50.202
echo.
set "DEVICE_IPS=192.168.50.201"
set "UserIPs="
set /p "UserIPs=Tapez les IPs ou appuyez sur ENTREE pour 192.168.50.201 : "
if defined UserIPs (set "DEVICE_IPS=%UserIPs%")
echo [OK] Lecteurs configures : %DEVICE_IPS%
echo.
echo ----------------------------------------------------------------------------
echo  ETAPE 3 / 3 : INSTALLATION DU FICHIER PONT zk-bridge.js
echo ----------------------------------------------------------------------------
if exist "%~dp0zk-bridge.js" (
    copy /Y "%~dp0zk-bridge.js" "%BRIDGE_DIR%\zk-bridge.js" >nul
    copy /Y "%~dp0*.bat" "%BRIDGE_DIR%\" >nul 2>nul
    copy /Y "%~dp0TESTER_CONNEXION_LECTEURS.bat" "%USERPROFILE%\Desktop\TESTER_CONNEXION_LECTEURS.bat" >nul 2>nul
    echo [OK] Fichiers installes dans %BRIDGE_DIR% et raccourci cree sur le Bureau.
) else (
    echo Telechargement direct de la derniere version depuis GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object Net.WebClient; $wc.Headers.Add('User-Agent', 'Mozilla/5.0'); $wc.Headers.Add('Cache-Control', 'no-cache'); try { $wc.DownloadFile('https://raw.githubusercontent.com/wassim-py/massinissa-soft/main/zk-bridge/zk-bridge.js?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), '$env:USERPROFILE\MassinissaK50Bridge\zk-bridge.js') } catch {}"
)
if not exist "%BRIDGE_DIR%\zk-bridge.js" (
    color 0C
    echo [ERREUR] Impossible d'installer zk-bridge.js. Verifiez la connexion Internet.
    echo.
    pause
    exit /b 1
)
echo [OK] Fichier zk-bridge.js pret.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$cfg = @{ deviceIps = '%DEVICE_IPS%'; branchId = [int]%BRANCH_ID%; isBranchExplicitlySet = $true; updatedAt = (Get-Date).ToString('o') }; [System.IO.File]::WriteAllText(('{0}\MassinissaK50Bridge\bridge_config.json' -f $env:USERPROFILE), ($cfg | ConvertTo-Json))"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-NetAdapterAdvancedProperty -Name 'Ethernet*' -RegistryKeyword 'PowerSavingMode' -RegistryValue 0 -ErrorAction SilentlyContinue; Set-NetAdapterAdvancedProperty -Name 'Ethernet*' -RegistryKeyword 'EnableGreenEthernet' -RegistryValue 0 -ErrorAction SilentlyContinue; Set-NetAdapterAdvancedProperty -Name 'Ethernet*' -RegistryKeyword '*EEE' -RegistryValue 0 -ErrorAction SilentlyContinue; Disable-NetAdapterPowerManagement -Name 'Ethernet*' -ErrorAction SilentlyContinue" >nul 2>nul
netsh advfirewall firewall add rule name="ZKTeco K50 Pro TCP 4370" dir=in action=allow protocol=TCP localport=4370 >nul 2>nul
netsh advfirewall firewall add rule name="ZKTeco K50 Pro TCP 4370 Out" dir=out action=allow protocol=TCP remoteport=4370 >nul 2>nul
netsh advfirewall firewall add rule name="Massinissa K50 Local Bridge 4375" dir=in action=allow protocol=TCP localport=4375 >nul 2>nul
echo [OK] Pare-feu Windows et carte reseau configures.
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MassinissaK50Bridge.vbs"
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run "cmd /c node ""%BRIDGE_DIR%\zk-bridge.js"" --ips=%DEVICE_IPS% --branch=%BRANCH_ID%", 0, False
) > "%STARTUP_VBS%"
echo [OK] Demarrage automatique Windows active.
echo Redemarrage du service local...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*zk-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
ping -n 2 127.0.0.1 >nul
wscript.exe "%STARTUP_VBS%"
ping -n 3 127.0.0.1 >nul
echo.
echo ============================================================================
echo   TEST DE CONNECTIVITE AVEC LES LECTEURS
echo ============================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ips = '%DEVICE_IPS%'.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }; foreach ($ip in $ips) { try { $client = New-Object System.Net.Sockets.TcpClient; $ar = $client.BeginConnect($ip, 4370, $null, $null); $wait = $ar.AsyncWaitHandle.WaitOne(1500, $false); if ($wait -and $client.Connected) { $client.EndConnect($ar); $client.Close(); Write-Host ('  [EN LIGNE] Lecteur ' + $ip + ':4370 connecte avec succes !') -ForegroundColor Green } else { $client.Close(); Write-Host ('  [HORS LIGNE] Lecteur ' + $ip + ':4370 injoignable. Verifiez cable ou switch.') -ForegroundColor Red } } catch { Write-Host ('  [ERREUR] Lecteur ' + $ip + ':4370 injoignable.') -ForegroundColor Red } }; try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:4375/status' -TimeoutSec 2 -ErrorAction Stop; Write-Host ('  [ACTIF] Pont en ecoute sur 127.0.0.1:4375 (Branche #' + $res.branchId + ')') -ForegroundColor Green } catch { Write-Host '  [!] Le pont demarre en arriere-plan...' -ForegroundColor Yellow }"
echo.
echo ============================================================================
echo   INSTALLATION TERMINEE AVEC SUCCES !
echo ============================================================================
echo.
pause
