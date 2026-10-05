"""
Схемы аутентификации
"""
import json
from pydantic import BaseModel, field_validator
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    birth_date: Optional[str] = None
    role: str
    visible_sections: Optional[list] = None

    @field_validator("visible_sections", mode="before")
    @classmethod
    def _parse_visible_sections(cls, v):
        """В БД поле — JSON-строка; приводим к списку при сериализации ответа."""
        if isinstance(v, str):
            try:
                return json.loads(v) if v.strip() else None
            except (ValueError, TypeError):
                return None
        return v or None

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    token: str
    user: UserResponse
