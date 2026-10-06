@echo off
chcp 65001 >nul
setlocal

echo ============================================
echo   Запуск портала мониторинга
echo ============================================
echo.

set PYTHON=D:\Projects\monitor\.venv-win\Scripts\python.exe
set BACKEND=D:\Projects\monitor\backend
set FRONTEND=D:\Projects\monitor\frontend

echo [1/3] Остановка старых процессов...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :80 ^| findstr LISTENING') do (
    echo   Останавливаю PID %%p
    taskkill /F /PID %%p >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo.
echo [2/3] Сборка фронтенда...
cd /d "%FRONTEND%"
call npm run build
if errorlevel 1 (
    echo   Ошибка сборки фронтенда
    pause
    exit /b 1
)
echo   Фронтенд готов

echo.
echo [3/3] Запуск бэкенда...
cd /d "%BACKEND%"
echo   Запускаю uvicorn на 0.0.0.0:80
start "Monitor Backend" /B "" "%PYTHON%" -m uvicorn app.main:app --host 0.0.0.0 --port 80 --log-level info

timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo   Проверка...
echo ============================================
for /f "tokens=2 delims=:" %%i in ('curl -s http://127.0.0.1/health ^| findstr status') do echo   Статус: %%i

echo.
echo ============================================
echo   Готово!
echo ============================================
echo   Локально:  http://127.0.0.1/
echo   По сети:   http://192.168.19.134/
echo   Логи:      %BACKEND%\logs\app.log
echo.
echo   Для остановки закройте это окно или нажмите Ctrl+C
echo ============================================

pause
