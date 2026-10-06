# Project Map — Monitor

## Structure
```
D:\Projects\monitor/
├── agent/                      # Агент мониторинга (Python)
│   ├── agent.py                # Main agent loop
│   ├── config.yaml.example     # Example config
│   ├── checks/                 # Check implementations
│   ├── inventory.py            # Inventory collection
│   ├── discovery.py            # Network discovery listener
│   └── service_windows.py      # Windows service wrapper
├── backend/
│   └── app/
│       ├── main.py             # FastAPI entry, lifespan, scheduler
│       ├── api/
│       │   ├── __init__.py     # Router aggregator
│       │   ├── agent.py        # Agent build + manual add + ping
│       │   ├── analytics.py    # UserActivity tracking + dashboard
│       │   ├── auth.py         # Login/logout/SSO, tracks logins
│       │   ├── backup.py       # Backup download/restore/schedule
│       │   ├── inventory.py    # HostSnapshot (agent reports)
│       │   ├── assets.py       # Asset categories/fields/items
│       │   ├── services.py     # Service CRUD + grouping
│       │   ├── history.py      # StatusHistory per service
│       │   ├── alerts.py       # Alert CRUD
│       │   ├── admin.py        # Sections/users/news/phones CRUD
│       │   ├── settings.py     # App settings (LDAP/SMTP/etc)
│       │   ├── helpdesk.py     # Tickets
│       │   └── ...
│       ├── models/
│       │   ├── user.py         # User
│       │   ├── service.py      # Service
│       │   ├── status_history.py
│       │   ├── alert.py
│       │   ├── assets.py       # AssetCategory, AssetField, AssetItem
│       │   ├── analytics.py    # UserActivity
│       │   └── ...
│       ├── schemas/            # Pydantic schemas
│       ├── services/           # Business logic
│       │   ├── auth_service.py
│       │   ├── backup_scheduler.py
│       │   └── ...
│       └── core/
│           ├── config.py       # Settings
│           ├── database.py     # Engine, SessionLocal, get_db
│           └── migrations.py   # ensure_columns, sqlite_db_path
├── frontend/
│   └── src/
│       ├── App.jsx             # Routes
│       ├── pages/
│       │   ├── Dashboard.jsx   # Host cards (monitoring)
│       │   ├── Inventory.jsx   # Agent inventory detail
│       │   ├── Assets.jsx      # Asset accounting (Связь/Терминалы/Техника)
│       │   ├── Analytics.jsx   # Analytics dashboard
│       │   ├── AdminPanel.jsx  # Admin tabs
│       │   └── ...
│       ├── components/
│       │   ├── ServiceCard.jsx
│       │   ├── ServiceDetails.jsx
│       │   └── ...
│       ├── lib/
│       │   ├── api.js          # API_BASE, helpers
│       │   └── portal-auth.js  # Auth + inactivity logout
│       └── hooks/
│           └── useFetch.js     # Polling fetch hook
└── .kilo/                      # Kilo config/plans
```

## Database (SQLite + SQLAlchemy)
- `users` — portal users (domain + local)
- `services` — monitored services (tcp/http/icmp/etc)
- `status_history` — per-service check results
- `alerts` — generated alerts
- `host_snapshots` — agent inventory JSON payloads
- `asset_categories` + `asset_fields` + `asset_items` — manual inventory tables
- `user_activities` — analytics events
- `news`, `messages`, `phone_book_entries`, `helpdesk_tickets`, `portal_tasks`, etc.

## Key API Routes
- `POST /api/auth/login` — JWT token
- `POST /api/heartbeat` — agent check results
- `POST /api/inventory` — agent snapshot (token auth)
- `GET /api/inventory` — list hosts (public)
- `POST /api/agent/ping` — minimal startup ping (token auth)
- `POST /api/agent/manual` — add agent manually (admin JWT)
- `POST /api/agent/build` — build agent zip (admin JWT)
- `POST /api/discovery/admin-scan` — admin network scan (admin JWT)
- `POST /api/discovery/scan` — agent-triggered scan (token auth)
- `GET/PUT /api/backup/schedule` — backup schedule (admin)
- `POST /api/backup/trigger` — manual backup (admin)
- `GET /api/analytics/dashboard` — analytics data (admin JWT)
- `POST /api/analytics/event` — track event (admin JWT)
- `GET/POST /api/assets/categories` — asset CRUD
- `GET/POST /api/assets/items` — asset items CRUD

## Agent
- Reads `config.yaml`, runs check loop every N seconds
- Sends inventory + heartbeats to backend
- Auto-creates services on backend on first run

## Frontend Routes
- `/` — Login
- `/portal` — Portal home (news, requests)
- `/portal/analytics` — Analytics dashboard (light theme, admin only)
- `/helpdesk` — Employee helpdesk
- `/helpdesk/admin` — Admin helpdesk
- `/phones` — Phone book
- `/monitor` — Dashboard (host cards)
- `/monitor/assets` — Asset accounting
- `/monitor/agent` — Agent build + manual add + network scan
- `/monitor/scanner` — Network scanner (separate page, admin-only)
- `/inventory` — Agent inventory list
- `/inventory/:hostId` — Agent inventory detail
- `/portal/admin` — Admin panel

## Important Patterns
- Backend serves frontend SPA on port 80 (uvicorn `--port 80`, cwd `backend/`); rebuild frontend (`cd frontend && npm run build`) after UI changes
- Agent build default backend URL = `http://<host>` (port 80, no explicit port)
- Agent token = `settings.SECRET_KEY` (shared secret)
- JWT tokens HMAC-signed, TTL = 30 min
- `engine.dispose()` before DB file operations
- Scheduler pauses during restore
- Frontend uses `useFetch` with polling intervals; pass `headers` for authenticated endpoints
- Admin auth: `require_admin` dependency
- Security: security headers middleware in `app/main.py` (X-Frame-Options DENY etc.); login throttle in `auth.py` (_login_attempts)
- Backup schedule: PUT /api/backup/schedule re-registers APScheduler job `auto_backup` live (no restart)
- Assets (Инвентаризация): categories «Связь/Терминалы/Техника», fields CRUD admin-only via `+ Поле` button, items values inline-edit; category rename requires direct DB update if already seeded
- Agent build defaults: net suite ping (Default-Gateway + DNS), interval 60s; ping latency chart in ServiceDetails (recharts, 24h)
- Analytics: portal-only (`/portal/analytics`), admin-only, auth headers required in fetch
- Discovery: admin-scan endpoint for manual network scans from Agent page; agent auto-responds on TCP 19443
- Agent startup: `_send_ping()` uses psutil with fallback to `socket.getaddrinfo`; `_send_inventory()` retries 3x
- Agent Windows service: `service_windows.py` wraps `MonitoringAgent.run()`; logs to `agent-service.log`
- Agent config: `backend.url` must point to server (port 80), `backend.token` must equal server `SECRET_KEY`
- Agent networking: httpx proxy bypass required if system proxy is set (`proxies="http://"` in AsyncClient); otherwise localhost requests get 503 from proxy
- Discovery: admin-scan endpoint for manual network scans from Agent page; agent auto-responds on TCP 19443
- Scanner: separate page `/monitor/scanner` (dark monitoring, admin-only), replaces inline DiscoveryPanel in Inventory.jsx
- Analytics: portal-only (`/portal/analytics`), removed from monitoring routes and Dashboard
