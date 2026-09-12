@echo off
setlocal
cd /d "%~dp0"
set "PY=%~dp0.venv\Scripts\python.exe"
if exist "%PY%" goto ready
py -3.13 -m venv "%~dp0.venv"
if errorlevel 1 goto failed
"%PY%" -m pip install pyyaml==6.0.2 httpx==0.27.2 psutil==6.0.0
if errorlevel 1 goto failed
:ready
if /I "%~1"=="--configure" goto configure
if exist config.yaml goto run
:configure
"%PY%" setup_client.py
if errorlevel 1 goto failed
if not exist config.yaml exit /b 0
:run
"%PY%" agent.py --config "%~dp0config.yaml"
if errorlevel 1 goto failed
exit /b 0
:failed
echo Client could not start. Install Python 3.13 with the Python launcher and check the error above.
pause
exit /b 1