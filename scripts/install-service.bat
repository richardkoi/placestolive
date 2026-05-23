@echo off
:: Install placestolive as a Windows Service via Shawl.
:: Requires: winget install mtkennerly.shawl
:: Must run as Administrator.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script must be run as Administrator.
    echo Right-click and select "Run as administrator".
    pause
    exit /b 1
)

set "PTL_HOME=%~dp0.."
set "PYTHON=%PTL_HOME%\venvs\placestolive\Scripts\python.exe"

where shawl >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: shawl not found. Install it with: winget install mtkennerly.shawl
    pause
    exit /b 1
)

if not exist "%PYTHON%" (
    echo ERROR: Python venv not found at %PYTHON%
    echo Run first-time setup ^(see DEPLOYMENT.md^) before installing the service.
    pause
    exit /b 1
)

if not exist "%PTL_HOME%\app\dist\index.html" (
    echo ERROR: Frontend build not found at app\dist\
    echo Run: cd app ^&^& npm install ^&^& npm run build
    pause
    exit /b 1
)

:: Remove existing service if present (idempotent reinstall)
sc query placestolive >nul 2>&1
if %errorlevel% equ 0 (
    echo Removing existing placestolive service...
    net stop placestolive >nul 2>&1
    sc delete placestolive >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo Installing placestolive service...
shawl add --name placestolive --cwd "%PTL_HOME%" --stop-timeout 10000 -- "%PYTHON%" -m uvicorn server.main:app --host 127.0.0.1 --port 8500

if %errorlevel% neq 0 (
    echo ERROR: Failed to install service.
    pause
    exit /b 1
)

:: Set to Automatic (Delayed Start) so network is available at boot
sc config placestolive start= delayed-auto

:: Grant Interactive Users permission to start/stop without admin
sc sdset placestolive D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWRPWPLOCRRC;;;IU)

echo.
echo Service installed successfully.
echo.
echo   Start:   net start placestolive
echo   Stop:    net stop placestolive
echo   Remove:  scripts\uninstall-service.bat
echo   Open:    http://127.0.0.1:8500
echo.
echo The service will auto-start on boot (delayed start).
echo Starting now...
net start placestolive
pause
