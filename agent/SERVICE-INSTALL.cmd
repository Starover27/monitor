@echo off
rem Установка/удаление агента как службы Windows одним кликом.
rem Использование:
rem   SERVICE-INSTALL.cmd install   — установить и запустить службу MonitorAgent
rem   SERVICE-INSTALL.cmd remove    — остановить и удалить службу
setlocal
cd /d "%~dp0"
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=install"

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" py -3 -m venv "%~dp0.venv"
if errorlevel 1 goto failed
"%PY%" -m pip install --quiet pyyaml==6.0.2 httpx==0.27.2 psutil==6.0.0 pywin32==311
if errorlevel 1 goto failed

"%PY%" service_windows.py %ACTION%
if errorlevel 1 goto failed

if /i "%ACTION%"=="install" (
  net start MonitorAgent
  echo.
  echo Служба MonitorAgent установлена и запущена. Проверить: services.msc
) else (
  echo Служба MonitorAgent удалена.
)
exit /b 0

:failed
echo Ошибка установки службы. Запустите этот скрипт от имени администратора.
exit /b 1
