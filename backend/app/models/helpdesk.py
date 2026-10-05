"""
Модели HelpdeskTicket и TicketEvent — заявки хелпдеска и журнал событий (трекер)
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class HelpdeskTicket(Base):
    __tablename__ = "helpdesk_tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    category = Column(String(64), nullable=False, default="other",
                      comment="pc, network, software, printer, phone, access, other")
    priority = Column(String(16), nullable=False, default="normal",
                      comment="low, normal, high, critical")
    description = Column(Text, nullable=True)

    status = Column(String(32), nullable=False, default="new", index=True,
                    comment="new, in_progress, done, cancelled")

    employee_name = Column(String(256), nullable=False, index=True)
    employee_room = Column(String(64), nullable=True)
    employee_phone = Column(String(64), nullable=True)
    ip_address = Column(String(64), nullable=True)

    assignee = Column(String(256), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    events = relationship("TicketEvent", back_populates="ticket",
                          cascade="all, delete-orphan", order_by="TicketEvent.created_at")

    def __repr__(self):
        return f"<HelpdeskTicket id={self.id} status={self.status} title={self.title!r}>"


class TicketEvent(Base):
    __tablename__ = "helpdesk_ticket_events"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("helpdesk_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    author = Column(String(256), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ticket = relationship("HelpdeskTicket", back_populates="events")
