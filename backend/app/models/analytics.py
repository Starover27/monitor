"""
Модель UserActivity — события пользователей для аналитики.
"""
import json
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class UserActivity(Base):
    __tablename__ = "user_activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)  # login | page_view | news_read | news_created | ticket_created | section_open
    path = Column(String(256), nullable=True)  # URL или раздел
    meta = Column(Text, nullable=True)  # JSON с доп. данными
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    user = relationship("User")

    def __repr__(self):
        return f"<UserActivity id={self.id} user={self.user_id} type={self.event_type} path={self.path}>"
