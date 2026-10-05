"""
PortalSection — настраиваемые разделы портала (меню) и их доступность.
"""
from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base


class PortalSection(Base):
    __tablename__ = "portal_sections"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(128), nullable=False)
    icon = Column(String(16), nullable=True)
    path = Column(String(256), nullable=False)
    description = Column(String(512), nullable=True, comment="описание модуля для карты событий")
    sort_order = Column(Integer, default=0, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    admin_only = Column(Boolean, default=False, nullable=False, comment="виден только админам")

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "icon": self.icon or "",
            "path": self.path,
            "description": self.description or "",
            "sort_order": self.sort_order or 0,
            "enabled": bool(self.enabled),
            "admin_only": bool(self.admin_only),
        }
