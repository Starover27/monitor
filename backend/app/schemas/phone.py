"""
Схемы для книги телефонных номеров
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PhoneEntryBase(BaseModel):
    full_name: str
    position: Optional[str] = None
    department: Optional[str] = None
    mobile: Optional[str] = None
    work_phone: Optional[str] = None
    internal: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None


class PhoneEntryCreate(PhoneEntryBase):
    pass


class PhoneEntryUpdate(PhoneEntryBase):
    full_name: Optional[str] = None


class PhoneEntryResponse(PhoneEntryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
