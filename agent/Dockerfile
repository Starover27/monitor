# Agent Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код агента
COPY agent.py .
COPY checks ./checks

# Конфиг будет монтироваться через volume
# docker run -v $(pwd)/config.yaml:/app/config.yaml ...

CMD ["python", "agent.py"]
