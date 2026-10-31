@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Diagnostic Réseau ZKTeco K50 Pro — Massinissa Academy
color 0B

echo ============================================================================
echo   MASSINISSA ACADEMY — TEST DE DIAGNOSTIC DES LECTEURS K50 PRO
echo ============================================================================
echo.

set "BRIDGE_DIR=%USERPROFILE%\MassinissaK50Bridge"
set "DEVICE_IPS=192.168.50.201"
set "BRANCH_ID=1"

if exist "%BRIDGE_DIR%\bridge_config.json" (
    for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "try { $c = Get-Content '%BRIDGE_DIR%\bridge_config.json' -Raw | ConvertFrom-Json; Write-Host $c.deviceIps; } catch {}"`) do (
        if not "%%A"=="" set "DEVICE_IPS=%%A"
    )
    for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "try { $c = Get-Content '%BRIDGE_DIR%\bridge_config.json' -Raw | ConvertFrom-Json; Write-Host $c.branchId; } catch {}"`) do (
        if not "%%A"=="" set "BRANCH_ID=%%A"
    )
)

echo [CONFIGURATION DÉTECTÉE]
echo  - Site / Branche : #%BRANCH_ID%
echo  - Lecteur(s)     : %DEVICE_IPS%
echo.
echo Test des connexions TCP (Port 4370) en cours...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ips = '%DEVICE_IPS%'.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }; $allOk = $true; foreach ($ip in $ips) { Write-Host ('Test du lecteur ' + $ip + ' :') -NoNewline; $sw = [System.Diagnostics.Stopwatch]::StartNew(); try { $client = New-Object System.Net.Sockets.TcpClient; $ar = $client.BeginConnect($ip, 4370, $null, $null); $wait = $ar.AsyncWaitHandle.WaitOne(2000, $false); $sw.Stop(); if ($wait -and $client.Connected) { $client.EndConnect($ar); $client.Close(); Write-Host ('  [✓ EN LIGNE] Connecté en ' + $sw.ElapsedMilliseconds + 'ms (Port 4370 OK)') -ForegroundColor Green } else { $client.Close(); $allOk = $false; Write-Host '  [✗ HORS LIGNE] Délai d''attente dépassé (Injoignable sur 4370)' -ForegroundColor Red } } catch { $allOk = $false; Write-Host ('  [✗ ERREUR] ' + $_.Exception.Message) -ForegroundColor Red } }; Write-Host ''; Write-Host 'Test du Pont Local (127.0.0.1:4375) :' -NoNewline; try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:4375/status' -TimeoutSec 2 -ErrorAction Stop; Write-Host '  [✓ ACTIF]' -ForegroundColor Green; Write-Host ('  -> Branche active dans le pont : #' + $res.branchId); Write-Host ('  -> Lecteur(s) géré(s) : ' + $res.deviceIp); Write-Host ('  -> Scans en attente de synchronisation : ' + $res.pendingScans.Count); foreach ($d in $res.devices) { $st = if ($d.connected) { 'EN LIGNE' } else { 'DÉCONNECTÉ' }; $color = if ($d.connected) { 'Green' } else { 'Red' }; Write-Host ('     • ' + $d.ip + ' -> ' + $st) -ForegroundColor $color } } catch { Write-Host '  [✗ INACTIF] Le pont ne répond pas sur le port 4375 !' -ForegroundColor Red; $allOk = $false }; if (-not $allOk) { Write-Host ''; Write-Host '================ CONSEILS DE DÉPANNAGE ================' -ForegroundColor Yellow; Write-Host '1. Vérifiez que le lecteur K50 Pro est allumé (écran bleu/vert visible).' -ForegroundColor Yellow; Write-Host '2. Vérifiez le câble Ethernet RJ45 reliant le lecteur au PC ou au Switch.' -ForegroundColor Yellow; Write-Host '3. Sur l''écran du K50 Pro, allez dans : Menu -> Comm. -> Ethernet' -ForegroundColor Yellow; Write-Host '   Vérifiez que l''adresse IP correspond bien à celle configurée.' -ForegroundColor Yellow; Write-Host '4. Vérifiez que la clé de communication (Comm Key) est à 0.' -ForegroundColor Yellow; Write-Host '========================================================' -ForegroundColor Yellow }"

echo.
pause
