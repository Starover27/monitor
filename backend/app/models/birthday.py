"""
Модель Birthday — дни рождения сотрудников (из dr.docx), отмечаются в календаре портала.
"""
from sqlalchemy import Column, Integer, String
from app.core.database import Base


class Birthday(Base):
    __tablename__ = "birthdays"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(256), nullable=False, index=True)
    birth_date = Column(String(10), nullable=False, index=True)  # "YYYY-MM-DD"
    position = Column(String(256), nullable=True)

    def __repr__(self):
        return f"<Birthday {self.full_name} {self.birth_date}>"
