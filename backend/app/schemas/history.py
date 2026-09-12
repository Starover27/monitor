"""
Схемы для History - история проверок
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class StatusHistoryResponse(BaseModel):
    """История одной проверки"""
    id: int
    service_id: int
    status: str
    latency_ms: Optional[int] = None
    error_message: Optional[str] = None
    
    # Метрики
    metric_value: Optional[float] = None
    metric_unit: Optional[str] = None
    
    checked_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True
