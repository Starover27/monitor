"""
Agent router — генерация готового клиента (build) для установки на хосты.

POST /api/agent/build  (только админ)
  Тело: параметры конфигурации (backend_url, host_id, check_interval, инвентаризация,
  список проверок services, интервалы/таймауты/ретраи/логирование, порт разведки и т.д.).
  Ответ: zip-архив. Если собран agent/dist/MonitorClient.exe — в zip кладётся
  готовый exe (Python на целевом ПК не нужен); иначе — исходники + скрипты venv.
  На клиенте достаточно распаковать и запустить MonitorClient.exe (или START-CLIENT.cmd).

POST /api/agent/ping  (анонимно по токену)
  Минимальный «я жив» от агента при старте. Создаёт/обновляет запись в host_snapshots,
  чтобы в разделе «Клиенты» сразу появилась карточка, даже если полная инвентаризация
  пока не собралась (нет прав на диски/сертификаты и т.д.).
"""
import io
import json
import logging
import secrets
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_db
from app.api.auth import require_admin
from app.api.inventory import HostSnapshot
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent"])

AGENT_DIR = Path(__file__).resolve().parents[3] / "agent"

# Файлы, которые попадают в zip (относительно agent/)
AGENT_FILES = [
    "agent.py",
    "watchlist.py",
    "token_file.py",
    "service_windows.py",
    "service_commands.py",
    "discovery.py",
    "inventory.py",
    "setup_client.py",
    "start-client.cmd",
    "SERVICE-INSTALL.cmd",
    "config.yaml.example",
]
AGENT_DIRS = {"checks"}

# Готовый exe-клиент (собирается через agent/BUILD-EXE.cmd). Если он есть —
# в zip кладём его, и Python на целевом ПК не нужен вообще.
CLIENT_EXE = AGENT_DIR / "dist" / "MonitorClient.exe"

DEFAULT_HOST_ID = "agent-client"


class AgentPing(BaseModel):
    host_id: str = Field(min_length=1, max_length=128)
    hostname: str = Field(min_length=1, max_length=255)
    addresses: List[str] = Field(max_length=64)


class AgentPing(BaseModel):
    host_id: str = Field(min_length=1, max_length=128)
    hostname: str = Field(min_length=1, max_length=255)
    addresses: List[str] = Field(max_length=64)


@router.post("/ping")
def agent_ping(payload: AgentPing, x_agent_token: str = Header(...), db=Depends(get_db)):
    """Минимальный «я жив» от агента при старте. Не требует прав администратора."""
    if settings.SECRET_KEY == "your-secret-key-change-in-production" or not secrets.compare_digest(x_agent_token, settings.SECRET_KEY):
        raise HTTPException(401, "Настройте общий SECRET_KEY сервера и токен клиента")
    now = datetime.now(timezone.utc)
    row = db.get(HostSnapshot, payload.host_id)
    if row is None:
        row = HostSnapshot(host_id=payload.host_id)
        db.add(row)
    row.payload = {
        "host_id": payload.host_id,
        "hostname": payload.hostname,
        "addresses": payload.addresses[:64],
        "timestamp": now.isoformat(),
        "uptime_seconds": 0,
        "certificates": [],
        "disks": [],
        "services": [],
        "roots": [],
        "errors": [],
        "ping_only": True,
    }
    row.received_at = now
    db.commit()
    return {"ok": True}


class BuildRequest(BaseModel):
    backend_url: str = Field(min_length=1, max_length=256)
    host_id: str = Field(min_length=1, max_length=128, default=DEFAULT_HOST_ID)
    check_interval: int = Field(default=30, ge=5, le=86400)
    check_timeout: int = Field(default=5, ge=1, le=120)
    inventory_enabled: bool = True
    discovery_enabled: bool = True
    cert_roots: List[str] = Field(default_factory=list, max_length=32)
    windows_services: List[str] = Field(default_factory=list, max_length=64)
    services: List[dict] = Field(default_factory=list, max_length=256)
    # Дополнительные параметры (необязательные — для обратной совместимости)
    log_level: str = Field(default="INFO")
    log_file: str = Field(default="agent.log", max_length=256)
    log_max_mb: int = Field(default=10, ge=1, le=1000)  # авто-ротация лога по размеру
    backend_timeout: int = Field(default=10, ge=1, le=300)
    retry_attempts: int = Field(default=3, ge=1, le=20)
    retry_delay: int = Field(default=5, ge=1, le=300)
    buffer_max: int = Field(default=500, ge=10, le=10000)
    discovery_port: int = Field(default=19443, ge=1024, le=65535)
    ping_count: int = Field(default=1, ge=1, le=10)

    @field_validator("backend_url")
    @classmethod
    def _http_url(cls, v: str) -> str:
        v = v.strip().rstrip("/")
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("backend_url должен начинаться с http:// или https://")
        return v

    @field_validator("log_level")
    @classmethod
    def _log_level(cls, v: str) -> str:
        v = (v or "INFO").upper()
        if v not in {"DEBUG", "INFO", "WARNING", "ERROR"}:
            raise ValueError("log_level: DEBUG | INFO | WARNING | ERROR")
        return v

    @field_validator("services")
    @classmethod
    def _services(cls, v: List[dict]) -> List[dict]:
        for s in v:
            if not isinstance(s, dict) or not str(s.get("name", "")).strip():
                raise ValueError("У каждого сервиса должно быть имя")
            if s.get("type") not in {"tcp", "http", "https", "icmp", "disk", "cpu", "memory", "network", "windows_service"}:
                raise ValueError(f"Неизвестный тип проверки: {s.get('type')}")
            for key in ("expected_status", "count", "interval", "threshold"):
                if key in s and s[key] not in (None, ""):
                    try:
                        s[key] = int(s[key])
                    except (TypeError, ValueError):
                        raise ValueError(f"Поле {key} должно быть числом (сервис {s.get('name')})")
            if s.get("type") in {"disk", "cpu", "memory", "network", "windows_service"}:
                continue
            if s.get("type") in {"http", "https"} and not str(s.get("url", "")).strip():
                raise ValueError(f"Для HTTP-проверки '{s.get('name')}' нужен URL")
            if s.get("type") == "icmp" and not str(s.get("host", "")).strip():
                raise ValueError(f"Для ICMP-проверки '{s.get('name')}' нужен host")
            if s.get("type") == "tcp" and (not str(s.get("host", "")).strip() or not s.get("port")):
                raise ValueError(f"Для TCP-проверки '{s.get('name')}' нужны host и порт")
        return v


def build_config_yaml(p: BuildRequest) -> str:
    """Собрать config.yaml по параметрам запроса."""
    cfg = {
        "backend": {
            "url": p.backend_url,
            "token": settings.SECRET_KEY,  # тот же общий секрет, что проверяет сервер
            "timeout": p.backend_timeout,
            "retry_attempts": p.retry_attempts,
            "retry_delay": p.retry_delay,
            "buffer_max": p.buffer_max,
        },
        "check_interval": p.check_interval,
        "check_timeout": p.check_timeout,
        "inventory": {
            "enabled": p.inventory_enabled,
            "host_id": p.host_id,
            "certificate_roots": p.cert_roots,
            "windows_services": p.windows_services,
        },
        "discovery": {"enabled": p.discovery_enabled, "port": p.discovery_port},
        "logging": {
            "level": p.log_level,
            "file": p.log_file or "console",
            "max_mb": p.log_max_mb,  # лог автоматически обрезается при достижении размера
        },
        "services": [
            # expected_status/expected_body/count и т.п. прокидываем как есть,
            # лишние пустые поля не пишем, чтобы config.yaml был читаемым.
            {k: val for k, val in s.items() if val not in (None, "", [])}
            for s in p.services
        ],
    }
    return yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False)


def agent_files_bytes() -> dict:
    """Прочитать исходники агента с диска; ошибка -> 500 с понятным текстом."""
    files = {}
    for name in AGENT_FILES:
        path = AGENT_DIR / name
        if not path.is_file():
            raise HTTPException(500, f"Файл агента не найден: agent/{name}")
        files[name] = path.read_bytes()
    for dirname in AGENT_DIRS:
        d = AGENT_DIR / dirname
        if not d.is_dir():
            raise HTTPException(500, f"Каталог агента не найден: agent/{dirname}")
        for path in sorted(d.glob("*.py")):
            files[f"{dirname}/{path.name}"] = path.read_bytes()
    return files


class ManualAgentCreate(BaseModel):
    host_id: str = Field(min_length=1, max_length=128)
    hostname: str = Field(min_length=1, max_length=255)
    addresses: List[str] = Field(max_length=64)


@router.post("/manual", dependencies=[Depends(require_admin)])
def manual_add_agent(payload: ManualAgentCreate, db=Depends(get_db)):
    """Добавить агент вручную (создаёт запись в host_snapshots)."""
    now = datetime.now(timezone.utc)
    row = db.get(HostSnapshot, payload.host_id)
    if row is None:
        row = HostSnapshot(host_id=payload.host_id)
        db.add(row)
    row.payload = {
        "host_id": payload.host_id,
        "hostname": payload.hostname,
        "addresses": payload.addresses[:64],
        "timestamp": now.isoformat(),
        "uptime_seconds": 0,
        "certificates": [],
        "disks": [],
        "services": [],
        "roots": [],
        "errors": [],
        "ping_only": True,
        "manual": True,
    }
    row.received_at = now
    db.commit()
    return {"ok": True, "host_id": payload.host_id}


@router.post("/build", dependencies=[Depends(require_admin)])
def build_agent_client(payload: BuildRequest):
    """Собрать zip с готовым клиентом: конфиг + токен + exe (или исходники) + скрипты."""
    import secrets as _secrets

    token = settings.SECRET_KEY
    if token == "your-secret-key-change-in-production":
        raise HTTPException(400, "SECRET_KEY сервера не настроен — клиент будет отклонён сервером")

    files = None if CLIENT_EXE.is_file() else agent_files_bytes()

    cfg = build_config_yaml(payload)
    stamp = _secrets.token_hex(4)
    safe_host = "".join(c for c in payload.host_id if c.isalnum() or c in "-_")[:64] or "client"

    buf = io.BytesIO()
    has_exe = files is None
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("config.yaml", cfg)
        zf.writestr("TOKEN.txt", token + "\n")
        if has_exe:
            # Готовый exe: Python на целевом ПК не нужен вообще.
            zf.writestr("MonitorClient.exe", CLIENT_EXE.read_bytes())
        else:
            for name, data in files.items():
                zf.writestr(name, data)
            # Установочный скрипт с параметрами (idempotent)
            zf.writestr(
                "install-service.cmd",
                "\r\n".join([
                    "@echo off",
                    "rem Автогенерировано сервером. Установка клиента как Windows-сервиса.",
                    f"set HOST_ID={payload.host_id}",
                    "cd /d \"%~dp0\"",
                    "powershell -NoProfile -ExecutionPolicy Bypass -File install-service.ps1",
                    "pause",
                ]),
            )
            zf.writestr(
                "install-service.ps1",
                "\r\n".join([
                    "# Автогенерировано сервером.",
                    "$ErrorActionPreference = 'Stop'",
                    "$root = $PSScriptRoot",
                    "$python = Join-Path $root '.venv-win\\Scripts\\python.exe'",
                    "if (-not (Test-Path $python)) { py -3.13 -m venv (Join-Path $root '.venv-win') }",
                    "& $python -m pip install pyyaml==6.0.2 httpx==0.27.2 psutil==6.0.0 pywin32==311",
                    "$svc = 'MonitorAgent-' + $env:COMPUTERNAME",
                    "$pyExe = $python",
                    "$args = \"`\"$root\\agent.py`\" --config `\"$root\\config.yaml`\"\"",
                    "sc.exe create $svc binPath= \"\\\"$pyExe\\\" $args\" start= auto",
                    "sc.exe description $svc 'Monitoring agent'",
                    "sc.exe start $svc",
                    "Write-Host 'Service installed:' $svc",
                ]),
            )
        # Простой запуск от имени администратора (для exe и для исходников).
        zf.writestr(
            "START-CLIENT.cmd",
            "\r\n".join([
                "@echo off",
                "cd /d \"%~dp0\"",
                "if exist MonitorClient.exe (",
                "    MonitorClient.exe",
                ") else (",
                "    powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process cmd -ArgumentList '/k call start-client.cmd' -Verb RunAs\"",
                ")",
                "pause",
            ]),
        )
        # Установка клиента СРАЗУ как Windows-службы (один клик из распакованного пакета).
        # Сам повышает права администратора, ставит и запускает службу.
        zf.writestr(
            "INSTALL-SERVICE.bat",
            "\r\n".join([
                "@echo off",
                "setlocal EnableExtensions",
                "rem ==========================================================",
                "rem  INSTALL-SERVICE.bat — установка клиента как Windows-службы.",
                "rem  Запустите файл после распаковки пакета: сам запросит права",
                "rem  администратора, установит службу и сразу её запустит.",
                "rem ==========================================================",
                "cd /d \"%~dp0\"",
                "title Установки службы MonitorAgent...",
                "",
                "net session >nul 2>&1",
                "if errorlevel 1 (",
                "    echo Запрашиваю права администратора...",
                "    powershell -NoProfile -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\"",
                "    exit /b",
                ")",
                "",
                "if exist \"MonitorClient.exe\" (",
                "    echo [1/2] Устанавливаю службу из MonitorClient.exe...",
                "    \"MonitorClient.exe\" install",
                "    if errorlevel 1 goto :fail",
                "    echo [2/2] Запускаю службу...",
                "    \"MonitorClient.exe\" start",
                "    if errorlevel 1 goto :fail",
                "    goto :done",
                ")",
                "",
                "if exist \"install-service.cmd\" (",
                "    echo Устанавливаю службу из исходников (install-service.cmd)...",
                "    call install-service.cmd",
                "    goto :done",
                ")",
                "",
                ":fail",
                "echo.",
                "echo X Установка не удалась. Проверьте наличие config.yaml и права администратора.",
                "pause",
                "exit /b 1",
                "",
                ":done",
                "echo.",
                "echo ============================================================",
                "echo  Служба MonitorAgent установлена и запущена.",
                "echo  Статус:   sc query MonitorAgent",
                "echo  Остановка: sc stop MonitorAgent && sc delete MonitorAgent (удаление)",
                "echo ============================================================",
                "timeout /t 5",
                "exit /b 0",
            ]),
        )

    buf.seek(0)
    filename = f"monitor-agent-{safe_host}-{stamp}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Agent-Build-Mode": "exe" if has_exe else "sources",
        },
    )
