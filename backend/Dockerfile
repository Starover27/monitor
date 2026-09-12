# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY app ./app

# Каталог для SQLite БД (монтируется как volume в docker-compose)
RUN mkdir -p /app/data

# Порт FastAPI
EXPOSE 8000

# Запуск через uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
