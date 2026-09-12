"""
Модель StatusHistory - история проверок статуса
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    
    status = Column(String(16), nullable=False, comment="up/down")
    latency_ms = Column(Integer, nullable=True, comment="Время отклика в миллисекундах")
    error_message = Column(String(512), nullable=True)
    
    # Метрики (для системных проверок)
    metric_value = Column(Float, nullable=True, comment="Значение метрики (disk free %, CPU load %)")
    metric_unit = Column(String(32), nullable=True, comment="Единица измерения")
    
    checked_at = Column(DateTime(timezone=True), nullable=False, index=True, comment="Timestamp от агента")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Связь
    service = relationship("Service", back_populates="history")

    # Составной индекс для быстрой выборки истории по сервису
    __table_args__ = (
        Index('idx_service_checked', 'service_id', 'checked_at'),
    )

    def __repr__(self):
        return f"<StatusHistory service_id={self.service_id} status={self.status} at={self.checked_at}>"
