"""
Схемы для хелпдеска (заявки + события трекера)
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class TicketEventResponse(BaseModel):
    id: int
    ticket_id: int
    author: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class TicketCreate(BaseModel):
    title: str
    category: str = "other"
    priority: str = "normal"
    description: Optional[str] = None
    employee_name: str
    employee_room: Optional[str] = None
    employee_phone: Optional[str] = None
    ip_address: Optional[str] = None


class TicketUpdate(BaseModel):
    status: Optional[str] = None
    assignee: Optional[str] = None
    priority: Optional[str] = None
    comment: Optional[str] = None


class TicketResponse(BaseModel):
    id: int
    title: str
    category: str
    priority: str
    description: Optional[str] = None
    status: str
    employee_name: str
    employee_room: Optional[str] = None
    employee_phone: Optional[str] = None
    ip_address: Optional[str] = None
    assignee: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None
    events: List[TicketEventResponse] = []

    class Config:
        from_attributes = True


class TicketEventCreate(BaseModel):
    author: str
    message: str
