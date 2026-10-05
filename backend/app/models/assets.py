"""
Модели раздела «Инвентаризация» портала (монитор):
категории (Сотовые телефоны, Терминалы, Техника), настраиваемые поля и записи.
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class AssetCategory(Base):
    __tablename__ = "asset_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False, unique=True)
    icon = Column(String(16), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)


class AssetField(Base):
    """Поле (колонка) категории — админ может добавлять/удалять."""
    __tablename__ = "asset_fields"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("asset_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)


class AssetItem(Base):
    """Запись категории. data — JSON: {"<field_id>": "значение"}."""
    __tablename__ = "asset_items"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("asset_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    data = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)

    def __repr__(self):
        return f"<AssetItem cat={self.category_id} id={self.id}>"
