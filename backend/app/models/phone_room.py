"""
Модель PhoneRoom — кабинеты/телефоны по корпусам (из телефонного справочника tel.pdf).

Каждая строка: корпус → номер кабинета → название кабинета → телефон(ы) (внутренние).
"""
from sqlalchemy import Column, Integer, String
from app.core.database import Base


class PhoneRoom(Base):
    __tablename__ = "phone_rooms"

    id = Column(Integer, primary_key=True, index=True)
    building = Column(String(128), nullable=False, index=True)   # корпус/секция: "Шеронова 6", "Прямые линии"…
    room_no = Column(String(32), nullable=True)                  # № каб: "1", "207"…
    title = Column(String(256), nullable=False)                  # кабинет/пост: "Гинекология", "Касса"…
    phones = Column(String(256), nullable=True)                  # внутренние: "238, 011, 018"
    department = Column(String(128), nullable=True)              # отдел
    full_name = Column(String(256), nullable=True, index=True)   # ФИО (ответственный / прямая линия)
    sort_order = Column(Integer, nullable=False, default=0)

    def __repr__(self):
        return f"<PhoneRoom {self.building} №{self.room_no} {self.title}>"
