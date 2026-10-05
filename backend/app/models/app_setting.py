"""
AppSetting — изменяемые настройки портала (домен AD, SMTP и т.д.).
Хранятся в БД, редактируются из админ-панели без рестарта сервера.
"""
from sqlalchemy import Column, Integer, String
from app.core.database import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(64), primary_key=True)
    value = Column(String(2048), nullable=True)

    @classmethod
    def get(cls, db, key: str, default: str = "") -> str:
        row = db.query(cls).filter(cls.key == key).first()
        return row.value if row and row.value is not None else default

    @classmethod
    def set(cls, db, key: str, value: str):
        row = db.query(cls).filter(cls.key == key).first()
        if row:
            row.value = value
        else:
            db.add(cls(key=key, value=value))
