"""
Схемы админ-панели портала: разделы, пользователи, таблица учёта телефонов.
"""
from pydantic import BaseModel
from typing import Optional, Dict


# --- Разделы ---
class SectionCreate(BaseModel):
    label: str
    icon: Optional[str] = ""
    path: str
    description: Optional[str] = None
    sort_order: int = 0
    enabled: bool = True
    admin_only: bool = False


class SectionUpdate(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    path: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    enabled: Optional[bool] = None
    admin_only: Optional[bool] = None


class SectionResponse(SectionCreate):
    id: int

    class Config:
        from_attributes = True


# --- Пользователи ---
class UserAdminUpdate(BaseModel):
    role: Optional[str] = None
    disabled: Optional[bool] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    birth_date: Optional[str] = None
    password: Optional[str] = None  # смена пароля локальной учётки
    visible_sections: Optional[list] = None  # None = по умолчанию (все доступные по роли)


class UserAdminCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    role: str = "employee"


# --- Таблица учёта телефонов ---
class PhoneColCreate(BaseModel):
    name: str
    sort_order: int = 0


class PhoneRowCreate(BaseModel):
    data: Dict[str, str] = {}
