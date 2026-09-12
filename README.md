# 🚀 Monitoring System — система мониторинга сервисов

![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React%2018-61DAFB?logo=react&logoColor=black)
![Python](https://img.shields.io/badge/Agent-Python-3776AB?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker%20Compose-2496ED?logo=docker&logoColor=white)
![Alerts](https://img.shields.io/badge/уведомления-Telegram%20%2F%20Discord%20%2F%20Slack-2CA5E0)

> Полнофункциональная система мониторинга доступности сервисов в локальной сети: веб-интерфейс (React), бэкенд (FastAPI), агенты-коллекторы (Python) и система алертов с уведомлениями в Telegram/Discord/Slack. Плюс **инвентаризация оборудования** — агенты собирают данные о машинах сети.

## 📦 Архитектура

```
 Browser ──► Frontend (Nginx:80) ──► Backend (FastAPI:8000) ──► SQLite
                                            ▲
                        POST /api/heartbeat │
                Agent 1 (TCP) ─ Agent 2 (HTTP) ─ Agent N (ICMP)
```

**Стек:**
- Backend: FastAPI + SQLAlchemy + APScheduler (детектор алертов) + httpx (уведомления)
- Frontend: React 18 + Tailwind CSS + Recharts + React Router (Vite build)
- Agent: Python async — проверки TCP / HTTP / ICMP
- Упаковка: Docker + docker-compose

## 🚀 Быстрый старт (Docker)

### Требования
- Docker 20.10+
- Docker Compose v2+

### 1. Запуск бэкенда + фронтенда

```bash
cd monitor
docker-compose up -d --build
docker-compose ps
```

**Доступ:**
- Frontend (Dashboard): http://localhost
- Backend API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs

### 2. Запуск агента на другой машине

```bash
# 1. Скопируйте папку agent/ + docker-compose.yml
# 2. Создайте config.yaml
cp agent/config.yaml.example agent/config.yaml
nano agent/config.yaml

# Укажите backend.url (IP сервера) и токен
# Добавьте список сервисов

# 3. Запустите контейнер агента
docker-compose --profile agent up -d agent
docker-compose logs -f agent
```

## 💻 Запуск на Windows (без Docker)

```powershell
.\START.cmd
```

Скрипт сам проверит окружение (Python 3.13 + Node.js LTS), запустит бэкенд и фронтенд:
- Дашборд: http://127.0.0.1:5173/
- Инвентаризация: http://127.0.0.1:5173/inventory

Подробности — в `ИНСТРУКЦИЯ.md` и `СТЯ.md`. Агента можно собрать в автономный `.exe` (`agent/BUILD-EXE.cmd`) и распространять на машины без Python.

## ⚙️ Конфигурация

### Backend (.env)

Скопируйте `backend/.env.example` в `backend/.env`:

```env
DATABASE_URL=sqlite:///./monitoring.db
DEBUG=false

# Алерты
ALERT_CONSECUTIVE_FAILURES=2
ALERT_CHECK_INTERVAL_SECONDS=30

# Уведомления
NOTIFICATION_CHANNEL=telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=-1001234567890
```

### Agent (config.yaml)

```yaml
backend:
  url: "http://192.168.1.100:8000"
  token: "shared-secret-token"
  
check_interval: 30

services:
  - name: "PostgreSQL"
    type: "tcp"
    host: "192.168.1.10"
    port: 5432

  - name: "Web App"
    type: "http"
    url: "http://192.168.1.11/health"
    expected_status: 200

  - name: "Gateway"
    type: "icmp"
    host: "192.168.1.1"
```

## 📊 Возможности

✅ TCP, HTTP/HTTPS, ICMP проверки  
✅ Статусы: UP (зелёный), DOWN (красный), SLOW (жёлтый)  
✅ Dashboard с автообновлением каждые 10 сек  
✅ Графики latency за 24 часа (Recharts)  
✅ Фоновый детектор алертов (N fail подряд → создаётся alert)  
✅ Уведомления в Telegram/Discord/Slack  
✅ История проверок и лог инцидентов через API  
✅ Автозакрытие алертов при восстановлении сервиса  
✅ Инвентаризация машин сети: агент собирает сведения об оборудовании (`agent/inventory.py`, `agent/discovery.py`)  
✅ Агент упаковывается в автономный `.exe` для Windows (сборка одним скриптом)  

## 🐳 Docker команды

```bash
# Сборка и запуск
docker-compose up -d --build

# Логи
docker-compose logs -f backend

# Остановка
docker-compose down

# Перезапуск сервиса
docker-compose restart backend
```

## 📁 Структура

```
monitor/
├── docker-compose.yml
├── README.md
├── backend/          # FastAPI + APScheduler
│   ├── Dockerfile
│   └── app/
├── frontend/         # React + Nginx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
└── agent/            # Python async коллектор
    ├── Dockerfile
    └── checks/
```

## 📝 API

- `POST /api/heartbeat` — приём данных от агента
- `GET /api/services` — список сервисов
- `GET /api/history/{id}` — история проверок
- `GET /api/alerts` — лог инцидентов
- `GET /health` — health-check

## 📄 Лицензия

MIT
