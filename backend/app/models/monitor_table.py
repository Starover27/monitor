"""
Таблица ручного учёта телефонов в мониторинге: настраиваемые колонки + строки.
"""
from sqlalchemy import Column, Integer, String, Text
from app.core.database import Base


class PhoneTableColumn(Base):
    __tablename__ = "phone_table_columns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)


class PhoneTableRow(Base):
    __tablename__ = "phone_table_rows"

    id = Column(Integer, primary_key=True, index=True)
    data = Column(Text, nullable=False, default="{}", comment='JSON: {"<col_id>": "значение"}')
