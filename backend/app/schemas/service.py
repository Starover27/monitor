"""
Схемы для Service
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime


class ServiceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Уникальное имя сервиса")
    target: str = Field(..., min_length=1, max_length=512, description="Цель проверки: IP:port или URL")
    check_type: Literal["tcp", "http", "https", "icmp", "dns", "disk", "cpu", "memory", "network", "windows_service"] = Field(default="http")
    enabled: bool = Field(default=True)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name не может быть пустым")
        return v

    @field_validator("target")
    @classmethod
    def validate_target(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("target не может быть пустым")
        return v


class ServiceCreate(ServiceBase):
    """Схема для создания сервиса"""
    pass


class ServiceUpdate(BaseModel):
    """Схема для обновления сервиса"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    target: Optional[str] = Field(None, min_length=1, max_length=512)
    check_type: Optional[Literal["tcp", "http", "https", "icmp", "dns", "disk", "cpu", "memory", "network", "windows_service"]] = None
    enabled: Optional[bool] = None
    group_name: Optional[str] = Field(None, max_length=128)
    sort_order: Optional[int] = None


class ServiceResponse(ServiceBase):
    """Схема ответа для списка/деталей сервиса"""
    id: int
    current_status: Optional[Literal["up", "down", "unknown"]] = None
    last_latency_ms: Optional[int] = None
    last_checked_at: Optional[datetime] = None
    
    # Метрики
    last_metric_value: Optional[float] = None
    metric_unit: Optional[str] = None
    
    # Группировка
    group_name: Optional[str] = None
    sort_order: int = 0
    
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ServiceStatus(BaseModel):
    """Краткий статус для дашборда"""
    id: int
    name: str
    target: str
    current_status: Optional[str] = "unknown"
    last_latency_ms: Optional[int] = None
    last_checked_at: Optional[datetime] = None
    enabled: bool

    class Config:
        from_attributes = True


class ServiceGroupingUpdate(BaseModel):
    """Схема для массового обновления группировки"""
    id: int
    group_name: Optional[str] = None
    sort_order: int = 0
