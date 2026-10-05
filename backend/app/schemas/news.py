"""
Схемы новостей клиники
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class NewsCreate(BaseModel):
    title: str
    body: Optional[str] = None
    body_html: Optional[str] = None
    image: Optional[str] = None
    pinned: bool = False


class NewsUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    body_html: Optional[str] = None
    image: Optional[str] = None
    pinned: Optional[bool] = None


class NewsResponse(BaseModel):
    id: int
    title: str
    body: Optional[str] = None
    body_html: Optional[str] = None
    image: Optional[str] = None
    author: Optional[str] = None
    pinned: bool
    created_at: datetime

    class Config:
        from_attributes = True
