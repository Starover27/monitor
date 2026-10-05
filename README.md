# 🚀 Monitor — мониторинг ИТ-инфраструктуры и корпоративный портал

Единая система для локальной сети: **мониторинг сервисов и оборудования** + **портал сотрудника** (заявления, IT-поддержка, телефонный справочник, календарь задач) + **агенты-коллекторы** на машинах сети.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React%2018-61DAFB?logo=react&logoColor=black)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker%20Compose-2496ED?logo=docker&logoColor=white)

---

## ✨ Что умеет

**Мониторинг (тёмная панель, только для ИТ-администраторов)**
- Проверки сервисов: TCP, HTTP/HTTPS, ICMP — со статусами UP / DOWN / SLOW
- Dashboard с автообновлением, графики latency за 24 часа
- Фоновый детектор алертов (N падений подряд → инцидент) и уведомления в **Telegram / Discord / Slack**
- Инвентаризация: агент собирает сведения об оборудовании и Windows-службах
- Инциденты с историей, автозакрытие при восстановлении

**Портал сотрудника (светлый стиль)**
- Вход по **доменной учётке Active Directory** (LDAP), **автовход Windows (SSO)** и вход по **клиентскому сертификату (mTLS, порт 8443)**
- Заявления: отпуск, больничный, отгул, командировка; справки, матпомощь, кадровые вопросы
- IT-поддержка: заявки с трекером статуса (взял в работу → выполнен)
- Телефонный справочник по корпусам и кабинетам, книга учёта номеров
- Новости клиники (WYSIWYG-редактор), дни рождения, «Полезная информация»
- Календарь-органайзер задач с переадресацией коллегам, сообщения между сотрудниками
- Админ-панель: пользователи и права, разделы меню, новости, настройки домена и почты
- Email-уведомления (SMTP) при новых заявках и смене статусов

**Агент (Python, собираемый в .exe)**
- Асинхронные проверки TCP / HTTP / ICMP
- Сбор инвентаризации и состояния Windows-служб из `watchlist.txt`
- Автономный `.exe` для машин без Python

---

## 📦 Архитектура

```
            Browser ──►  http://<IP-сервера>/   (порт 80, без номера порта)
                                   │
                    ┌──────────────┴────────────────┐
                    │  Backend (FastAPI, порт 80)   │
                    │  · API /api/*                 │
                    │  · статика и SPA фронтенда    │
                    │  · SQLite (по умолчанию)      │
                    └──────────────┬────────────────┘
                                   ▲
            POST /api/heartbeat    │
        Agent 1 ─ Agent 2 ─ … ─ Agent N   (агенты на машинах сети)

            Опционально: HTTPS mTLS-прокси (порт 8443) — вход по сертификату
```

**Стек:** FastAPI + SQLAlchemy + APScheduler · React 18 + Tailwind + Vite · Python-агент (asyncio, PyInstaller) · Docker Compose

---

## 🚀 Быстрый старт

### Вариант 1. Windows (одна команда)

Требуется: **Python 3.13+** (`py`) и **Node.js LTS**.

```powershell
.\start-windows.ps1
```

Скрипт сам:
1. создаст виртуальное окружение и поставит зависимости бэкенда;
2. соберёт фронтенд в `frontend/dist` (если ещё не собран);
3. запустит бэкенд на **порту 80** — портал и API отдаётся одним процессом;
4. откроет браузер на `http://127.0.0.1/inventory`.

**Адреса:**
- Портал: `http://<IP-сервера>/` (порт 80 — в браузере номер порта не нужен)
- API: `http://<IP-сервера>/api/...` · Swagger: `http://<IP-сервера>/docs`
- Health-check: `http://<IP-сервера>/health`

Стартовые учётки (смените!): `admin/admin123`, `hr/hr123`, `ivanov/ivanov123`, `petrova/petrova123`.

### Вариант 2. Docker

```bash
cd monitor
docker-compose up -d --build
docker-compose ps
```

- Портал: `http://<сервер>/` (Nginx на порту 80 раздаёт SPA и проксирует `/api` на бэкенд)
- Бэкенд API: `http://<сервер>:8000` · Swagger: `http://<сервер>:8000/docs`
- Postgres поднимается автоматически; по умолчанию бэкенд работает на SQLite.

```bash
docker-compose logs -f backend   # логи
docker-compose down              # остановка
```

### Запуск как служба Windows (плановая задача)

```powershell
schtasks /Create /F /TN PortalBackend /TR "D:\Projects\monitor\portalbackend.bat" /SC ONSTART
schtasks /Run /TN PortalBackend
```

Бэкенд запускается на порту 80 и отдаёт и API, и портал (отдельного фронтенд-сервера больше не нужно).

---

## 🖥 Агент на машине клиента

1. Скопируйте папку `agent/` на целевую машину (или соберите `.exe`: `agent\BUILD-EXE.cmd` / `portable_client.py`).
2. Создайте конфиг `agent/config.yaml` по шаблону `agent/config.yaml.example`:

```yaml
backend:
  url: "http://192.168.1.100"     # адрес сервера (порт 80)
  token: "ваш-токен"              # значение SECRET_KEY сервера

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

3. Запустите: `python agent.py` (или `MonitorClient.exe`). Агенты появляются в «Клиентах» мониторинга, их Windows-службы (из `watchlist.txt`) — на карточках машин.

Инструкция по `.exe`-клиенту — в `agent/EXE-ИНСТРУКЦИЯ.txt` и `agent/НАЧНИТЕ ЗДЕСЬ.txt`.

---

## ⚙️ Конфигурация

### Backend (`backend/.env`)

```env
DATABASE_URL=sqlite:///./monitoring.db
DEBUG=false
API_PREFIX=/api

# Алерты
ALERT_CONSECUTIVE_FAILURES=2
ALERT_CHECK_INTERVAL_SECONDS=30

# Уведомления: telegram | discord | slack | none
NOTIFICATION_CHANNEL=telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=-1001234567890
# WEBHOOK_URL=...            # для Discord/Slack

# Active Directory (портал)
LDAP_SERVER=ldap://dc01.corp.local:389
LDAP_DOMAIN=CORP
LDAP_BASE_DN=DC=corp,DC=local
LDAP_ADMIN_GROUPS=ИТ-Администраторы,Domain Admins
SSO_ENABLED=true             # автовход Windows

# Email (портал)
SMTP_HOST=smtp.corp.local
SMTP_PORT=587
MAIL_FROM=portal@corp.local
NOTIFY_EMAIL_TO=helpdesk@corp.local
```

> Настройки LDAP/SMTP/SSO можно менять **без рестарта** прямо в Админ-панели — они хранятся в БД (`app_settings`) и имеют приоритет над `.env`.

### mTLS-вход по сертификатам (опционально)

`CERT_PROXY_ENABLED=true` (в `.env`) поднимает HTTPS-прокси на порту **8443**: пользователь получает личный сертификат (`.p12`) через Админ-панель → «Сертификаты», открывает `https://<сервер>:8443` и входит без пароля. CA и ключи создаются автоматически в `backend/ca/`.

---

## 🔐 Безопасность

- Токен агента (`SECRET_KEY`) создаётся при первом запуске и хранится в `backend/.env` (не коммитится)
- Пароли — PBKDF2-хэши; доменные проверки — simple-bind в AD
- mTLS-прокси вставляет доверенный заголовок `X-AD-USER` только по TLS
- CA-ключи и токен клиента исключены из git (`.gitignore`)

---

## 📁 Структура

```
monitor/
├── start-windows.ps1         # запуск под Windows (порт 80)
├── docker-compose.yml        # Docker: postgres + backend + nginx
├── backend/                  # FastAPI
│   ├── Dockerfile
│   └── app/
│       ├── api/              # 25 роутеров: auth, portal, helpdesk, phonebook,
│       │                     #   news, messages, tasks, alerts, inventory, …
│       ├── models/           # SQLAlchemy-модели
│       ├── services/         # алерты, нотификации, LDAP, CA, mTLS-прокси
│       └── main.py           # приложение + раздача SPA (порт 80)
├── frontend/                 # React + Vite + Tailwind
│   ├── Dockerfile            # build + Nginx
│   └── src/
│       ├── pages/            # Login, PortalHome, Helpdesk*, PhoneBook,
│       │                     # Dashboard, Inventory, Alerts, Assets, …
│       └── components/       # Layout, PortalLayout, SidePanel, …
├── agent/                    # Python-агент (+ сборка в .exe)
└── monic/                    # готовый клиент-агент (MonitorClient.exe)
```

## 📝 Основные API

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/auth/login` | вход (логин/пароль) |
| `GET` | `/api/auth/sso` | автовход Windows (Negotiate) |
| `GET` | `/api/auth/me` | текущий пользователь |
| `GET/POST` | `/api/portal` | заявления сотрудника |
| `GET/POST` | `/api/helpdesk` | заявки в IT |
| `GET/POST` | `/api/phonebook` | телефонный справочник |
| `GET/POST` | `/api/news` | новости |
| `GET/POST` | `/api/tasks` | календарь задач |
| `GET/POST` | `/api/messages` | сообщения |
| `POST` | `/api/heartbeat` | телеметрия от агента |
| `GET` | `/api/services`, `/api/alerts` | сервисы и инциденты |
| `GET` | `/api/inventory` | инвентаризация машин |
| `GET` | `/health` | health-check |

Полный список — в Swagger: `http://<сервер>/docs`

## 📄 Лицензия

MIT
