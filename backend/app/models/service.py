"""
Модель Service - мониторимый сервис/хост
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    target = Column(String(512), nullable=False, comment="IP:port или URL для проверки")
    check_type = Column(String(32), nullable=False, default="http", comment="tcp, http, https, icmp")
    enabled = Column(Boolean, default=True, nullable=False)

    # Денормализованные поля для быстрого ответа GET /api/services
    current_status = Column(String(16), nullable=True, comment="up/down/unknown")
    last_latency_ms = Column(Integer, nullable=True)
    last_checked_at = Column(DateTime(timezone=True), nullable=True)

    # Метрики (для системных проверок: disk/cpu/memory/network)
    last_metric_value = Column(Float, nullable=True, comment="Последнее значение метрики (для системных проверок)")
    metric_unit = Column(String(32), nullable=True, comment="Единица измерения метрики (%, GB, Mbps)")

    # Группировка и сортировка для UI
    group_name = Column(String(128), nullable=True, index=True, comment="Имя группы для визуальной группировки")
    sort_order = Column(Integer, default=0, nullable=False, comment="Порядок отображения в группе")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Связи
    history = relationship("StatusHistory", back_populates="service", cascade="all, delete-orphan", lazy="selectin")
    alerts = relationship("Alert", back_populates="service", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<Service id={self.id} name={self.name} target={self.target}>"
