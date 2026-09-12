@echo off
setlocal
cd /d "%~dp0"
set "PY=%~dp0.build-venv\Scripts\python.exe"
if not exist "%PY%" py -3.13 -m venv "%~dp0.build-venv"
if errorlevel 1 goto failed
"%PY%" -m pip install pyinstaller==6.19.0 pyyaml==6.0.2 httpx==0.27.2 psutil==6.0.0 pywin32==311
if errorlevel 1 goto failed
"%PY%" -m PyInstaller --noconfirm --clean portable.spec
if errorlevel 1 goto failed
"%~dp0dist\MonitorClient.exe" --self-test
if errorlevel 1 goto failed
echo Ready: %~dp0dist\MonitorClient.exe
exit /b 0
:failed
echo Build failed. See errors above.
exit /b 1