@echo off
cd /d D:\Projects\monitor\backend
"D:\Projects\monitor\.venv-win\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 80 --log-level info
