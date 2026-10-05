"""
Схемы сообщений и настроек интерфейса
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


# ==================== Сообщения ====================

class MessageCreate(BaseModel):
    recipient_id: int
    subject: Optional[str] = None
    body: str


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    sender_name: Optional[str] = None
    recipient_id: int
    recipient_name: Optional[str] = None
    subject: Optional[str] = None
    body: str
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MessageThreadResponse(MessageResponse):
    pass


# ==================== Настройки интерфейса ====================

class UISettingsResponse(BaseModel):
    LOGO_PATH: str = ""
    HERO_BG_IMAGE: str = ""
    HERO_BG_OPACITY: str = "0.35"
    HERO_BG_BLUR: str = "0"
    HERO_TITLE_COLOR: str = ""
    PANEL_BG: str = ""


class UIAllowlist:
    KEYS = {"LOGO_PATH", "HERO_BG_IMAGE", "HERO_BG_OPACITY", "HERO_BG_BLUR", "HERO_TITLE_COLOR", "PANEL_BG"}
