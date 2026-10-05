"""
Схемы для портала сотрудников
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PortalRequestCreate(BaseModel):
    kind: str
    employee_name: str
    details: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None


class PortalRequestUpdate(BaseModel):
    status: Optional[str] = None
    admin_comment: Optional[str] = None


class PortalRequestResponse(BaseModel):
    id: int
    kind: str
    employee_name: str
    details: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    status: str
    admin_comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
