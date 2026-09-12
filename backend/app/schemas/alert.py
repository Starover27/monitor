"""
Схемы для Alert - лог инцидентов
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AlertResponse(BaseModel):
    """Один алерт/инцидент для фронтенда"""
    id: int
    service_id: int
    service_name: Optional[str] = None
    service_target: Optional[str] = None
    alert_type: str
    message: str
    severity: str
    is_resolved: bool
    resolved_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
