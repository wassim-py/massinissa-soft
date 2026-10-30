@echo off
title Massinissa School - ZKTeco K50/ID PRO Live Bridge (v4)
echo =======================================================================
echo   Massinissa School - ZKTeco K50/ID PRO Biometric Attendance Bridge
echo =======================================================================
echo.
REM Default settings (edit IP or Branch ID below if needed):
if "%ZK_DEVICE_IP%"=="" set ZK_DEVICE_IP=192.168.50.201
if "%ZK_DEVICE_PORT%"=="" set ZK_DEVICE_PORT=4370
if "%BRANCH_ID%"=="" set BRANCH_ID=1
if "%CLOUD_APP_URL%"=="" set CLOUD_APP_URL=http://localhost:3000

node zk-bridge/zk-bridge.js --ips=%ZK_DEVICE_IP%
pause
