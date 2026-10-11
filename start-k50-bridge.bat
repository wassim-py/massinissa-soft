@echo off
title Massinissa School - ZKTeco K50/ID PRO Live Bridge
echo =======================================================================
echo   Massinissa School - ZKTeco K50/ID PRO Biometric Attendance Bridge
echo =======================================================================
echo.
REM Default settings (edit IP or Branch ID below if needed):
if "%ZK_DEVICE_IP%"=="" set ZK_DEVICE_IP=192.168.50.201
if "%ZK_DEVICE_PORT%"=="" set ZK_DEVICE_PORT=4370
if "%ZK_BRANCH_ID%"=="" set ZK_BRANCH_ID=1
if "%NEXT_PUBLIC_APP_URL%"=="" set NEXT_PUBLIC_APP_URL=http://localhost:3000

npx tsx scripts/zk-k50-bridge.ts --ip %ZK_DEVICE_IP% --port %ZK_DEVICE_PORT% --branch %ZK_BRANCH_ID% --app %NEXT_PUBLIC_APP_URL%
pause
