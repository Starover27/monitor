"""Latest read-only host snapshots. No remote commands or filesystem access."""
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, IPvAnyAddress
from sqlalchemy import Column, String, JSON, DateTime
from sqlalchemy.orm import Session
from app.core.database import Base
from app.core.config import settings
from app.api.deps import get_db

router = APIRouter(prefix="/inventory", tags=["Inventory"])


class HostSnapshot(Base):
    __tablename__ = "host_snapshots"
    host_id = Column(String(128), primary_key=True)
    payload = Column(JSON, nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False)


class Snapshot(BaseModel):
    host_id: str = Field(min_length=1, max_length=128)
    hostname: str = Field(min_length=1, max_length=255)
    addresses: list[IPvAnyAddress] = Field(max_length=64)
    timestamp: datetime
    uptime_seconds: float = Field(ge=0)
    certificates: list[dict] = Field(max_length=10000)
    disks: list[dict] = Field(max_length=256)
    services: list[dict] = Field(max_length=1000)
    roots: list[str] = Field(max_length=32)
    errors: list[str] = Field(max_length=1000)


@router.post("")
def report(payload: Snapshot, x_agent_token: str = Header(...), db: Session = Depends(get_db)):
    if settings.SECRET_KEY == "your-secret-key-change-in-production" or not secrets.compare_digest(x_agent_token, settings.SECRET_KEY):
        raise HTTPException(401, "Настройте общий SECRET_KEY сервера и токен клиента")
    if payload.timestamp.tzinfo is None:
        raise HTTPException(422, "timestamp must include timezone")
    now = datetime.now(timezone.utc)
    data = payload.model_dump(mode="json")
    data["clock_offset_seconds"] = (payload.timestamp - now).total_seconds()
    row = db.get(HostSnapshot, payload.host_id)
    if row is None:
        row = HostSnapshot(host_id=payload.host_id)
        db.add(row)
    row.payload, row.received_at = data, now
    db.commit()
    return {"success": True}


@router.get("")
def hosts(db: Session = Depends(get_db)):
    return [{**row.payload, "received_at": row.received_at.replace(tzinfo=timezone.utc).isoformat()}
            for row in db.query(HostSnapshot).order_by(HostSnapshot.received_at.desc()).all()]