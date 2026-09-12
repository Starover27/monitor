"""
Модель Alert - алерты при смене статуса
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    
    alert_type = Column(String(32), nullable=False, comment="down, up, slow")
    message = Column(String(1024), nullable=False)
    severity = Column(String(32), default="warning", comment="info, warning, critical")
    
    is_resolved = Column(Boolean, default=False, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Связь
    service = relationship("Service", back_populates="alerts")

    def __repr__(self):
        return f"<Alert id={self.id} service_id={self.service_id} type={self.alert_type}>"
