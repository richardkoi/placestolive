@echo off
:: Uninstall the placestolive Windows Service.
:: Must run as Administrator.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script must be run as Administrator.
    pause
    exit /b 1
)

sc query placestolive >nul 2>&1
if %errorlevel% neq 0 (
    echo Service placestolive is not installed.
    pause
    exit /b 0
)

echo Stopping placestolive service...
net stop placestolive >nul 2>&1

echo Deleting placestolive service...
sc delete placestolive

if %errorlevel% neq 0 (
    echo ERROR: Failed to delete service.
    pause
    exit /b 1
)

echo Service uninstalled.
pause
