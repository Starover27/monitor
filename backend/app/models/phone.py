"""
Модель PhoneBookEntry — книга учёта сотовых номеров и телефонов
"""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class PhoneBookEntry(Base):
    __tablename__ = "phone_book"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(256), nullable=False, index=True)
    position = Column(String(256), nullable=True)
    department = Column(String(256), nullable=True, index=True)
    mobile = Column(String(32), nullable=True)
    work_phone = Column(String(32), nullable=True)
    internal = Column(String(16), nullable=True)
    email = Column(String(256), nullable=True)
    note = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<PhoneBookEntry id={self.id} name={self.full_name}>"
