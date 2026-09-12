"""
Схемы для Heartbeat - прием данных от агента
"""
from pydantic import BaseModel, Field, field_validator
from typing import Literal
from datetime import datetime


class HeartbeatRequest(BaseModel):
    """Данные от агента при проверке сервиса"""
    service_id: int = Field(..., gt=0, description="ID проверяемого сервиса")
    status: Literal["up", "down"] = Field(..., description="Статус проверки")
    latency_ms: int | None = Field(None, ge=0, description="Время отклика в миллисекундах")
    error_message: str | None = Field(None, max_length=512, description="Сообщение об ошибке при статусе down")
    timestamp: datetime = Field(..., description="Время проверки (UTC)")
    
    # Метрики (опционально, для системных проверок)
    metric_value: float | None = Field(None, description="Значение метрики (CPU %, disk free GB)")
    metric_unit: str | None = Field(None, max_length=32, description="Единица измерения (%/GB/Mbps)")

    @field_validator("error_message")
    @classmethod
    def validate_error_for_down_status(cls, v: str | None, info) -> str | None:
        """Если статус down, желательно иметь error_message"""
        if v:
            return v.strip() or None
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "service_id": 1,
                "status": "up",
                "latency_ms": 45,
                "error_message": None,
                "timestamp": "2024-09-04T12:00:00Z"
            }
        }


class HeartbeatResponse(BaseModel):
    """Ответ на heartbeat"""
    success: bool
    message: str = "Heartbeat recorded"
    service_id: int
