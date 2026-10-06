import hmac
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from app.api.auth import require_admin
from app.api.deps import get_db
from app.core.config import settings
from app.core.database import SessionLocal
from app.services.discovery import DiscoveryConfig, scanner, targets

router = APIRouter(prefix='/discovery', tags=['Discovery'])


def authorize(x_agent_token: str = Header(...)):
    if settings.SECRET_KEY == 'your-secret-key-change-in-production' or not hmac.compare_digest(x_agent_token.encode(), settings.SECRET_KEY.encode()):
        raise HTTPException(401, 'Неверный токен управления')


class ScanConfig(BaseModel):
    ranges: list[str] = Field(default_factory=list, max_length=32)
    enabled: bool = False
    interval_seconds: int = Field(300, ge=60, le=86400)

    @field_validator('ranges')
    @classmethod
    def validate_ranges(cls, value):
        targets(value)
        return value


class AdminScanRequest(BaseModel):
    ranges: list[str] = Field(default_factory=list, max_length=32)

    @field_validator('ranges')
    @classmethod
    def validate_ranges(cls, value):
        targets(value)
        return value


@router.get('')
def status(db: Session = Depends(get_db)):
    row = db.get(DiscoveryConfig, 1)
    return {'config': row.config if row else ScanConfig().model_dump(), **scanner.state}


@router.put('', dependencies=[Depends(authorize)])
def configure(payload: ScanConfig, db: Session = Depends(get_db)):
    if scanner.state['running']:
        raise HTTPException(409, 'Дождитесь завершения текущего сканирования')
    row = db.get(DiscoveryConfig, 1)
    if row is None:
        row = DiscoveryConfig(id=1)
        db.add(row)
    row.config = payload.model_dump()
    db.commit()
    if payload.enabled:
        scanner.wake.set()
    return row.config


@router.post('/scan', dependencies=[Depends(authorize)], status_code=202)
def scan():
    if scanner.state['running'] or scanner.wake.is_set():
        raise HTTPException(409, 'Сканирование уже запущено или ожидает запуска')
    scanner.wake.set()
    return {'queued': True}


@router.post('/admin-scan', dependencies=[Depends(require_admin)], status_code=202)
def admin_scan(payload: AdminScanRequest):
    """Ручной запуск сканирования из веб-интерфейса (только админ)."""
    if scanner.state['running'] or scanner.wake.is_set():
        raise HTTPException(409, 'Сканирование уже запущено или ожидает запуска')
    config = {'ranges': payload.ranges, 'enabled': False, 'interval_seconds': 300}
    try:
        targets(config['ranges'])
    except ValueError as e:
        raise HTTPException(400, str(e))
    with SessionLocal() as db:
        row = db.get(DiscoveryConfig, 1)
        if row is None:
            row = DiscoveryConfig(id=1)
            db.add(row)
        row.config = config
        db.commit()
    scanner.wake.set()
    return {'queued': True, 'ranges': payload.ranges}