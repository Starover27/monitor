"""
Message — внутренние сообщения между пользователями портала.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject = Column(String(256), nullable=True)
    body = Column(Text, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)  # null = не прочитано
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    deleted_by_sender = Column(Boolean, default=False)
    deleted_by_recipient = Column(Boolean, default=False)

    sender = relationship("User", foreign_keys=[sender_id], lazy="joined")
    recipient = relationship("User", foreign_keys=[recipient_id], lazy="joined")

    def __repr__(self):
        return f"<Message {self.id} {self.sender_id}->{self.recipient_id}>"
