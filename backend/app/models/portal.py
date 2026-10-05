"""
Модель PortalRequest — заявления сотрудников через портал (справки, отпуск и т.д.)
"""
from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class PortalRequest(Base):
    __tablename__ = "portal_requests"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(64), nullable=False,
                  comment="certificate, vacation, statement, dayoff, other")
    employee_name = Column(String(256), nullable=False, index=True)
    details = Column(Text, nullable=True)
    date_from = Column(String(32), nullable=True)
    date_to = Column(String(32), nullable=True)
    status = Column(String(32), nullable=False, default="new", index=True,
                    comment="new, in_progress, done, rejected")
    admin_comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<PortalRequest id={self.id} kind={self.kind} status={self.status}>"
