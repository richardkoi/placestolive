@echo off
:: Dev launcher: hot-reload uvicorn on :8500.
:: For production-style always-on install, use scripts\install-service.bat.
:: For frontend HMR, run in a second terminal:  cd app ^&^& npm run dev

setlocal

set ROOT=%~dp0
cd /d "%ROOT%"
set VENV=%ROOT%venvs\placestolive
set PY=%VENV%\Scripts\python.exe

if not exist "%PY%" (
    echo [start] venv not found at %VENV%
    echo [start] Run first-time setup ^(see DEPLOYMENT.md^):
    echo     python -m venv venvs\placestolive
    echo     venvs\placestolive\Scripts\pip install -r server\requirements.txt
    echo     cd app ^&^& npm install ^&^& npm run build
    pause
    exit /b 1
)

echo [start] Launching placestolive (dev, hot-reload) on http://127.0.0.1:8500
"%PY%" -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8500
pause
