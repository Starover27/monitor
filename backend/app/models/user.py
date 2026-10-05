"""
Модель User — доменные учётные записи портала
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(128), unique=True, nullable=False, index=True)  # доменный логин
    full_name = Column(String(256), nullable=True)
    email = Column(String(256), nullable=True)
    department = Column(String(256), nullable=True)
    position = Column(String(256), nullable=True)
    role = Column(String(32), nullable=False, default="employee", comment="employee | admin")
    visible_sections = Column(Text, nullable=True, comment='JSON-массив путей разделов; NULL = по умолчанию')
    birth_date = Column(String(32), nullable=True, comment="дата рождения (из AD или вручную)")
    is_domain = Column(Boolean, default=False, comment="True если аккаунт доменный (LDAP)")
    ad_groups = Column(Text, nullable=True, comment='Группы из AD (JSON-массив имён)')
    password_hash = Column(String(256), nullable=True, comment="для локальных учёток")
    disabled = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<User id={self.id} username={self.username} role={self.role}>"
