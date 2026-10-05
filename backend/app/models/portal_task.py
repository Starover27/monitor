"""
Модель PortalTask — задачи-органайзер (личные и переадресуемые сотрудникам).
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base


class PortalTask(Base):
    __tablename__ = "portal_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    details = Column(String(1024), nullable=True)
    due_date = Column(String(32), nullable=True, index=True)      # "2026-10-15" (дата из календаря)
    document_url = Column(String(512), nullable=True)             # ссылка на внутренний документ (UNC-путь)
    done = Column(Boolean, nullable=False, default=False)
    # владелец задачи (строкой: ФИО/логин — как имя сотрудника в портале)
    owner = Column(String(128), nullable=False, index=True)
    # от кого создана (для переадресованных — автор)
    author = Column(String(128), nullable=True)
    # переадресация: кому адресована (ФИО или "всем") + пометка
    assignee = Column(String(128), nullable=True, index=True)     # None = себе
    forwarded = Column(Boolean, nullable=False, default=False)    # True = переадресована
    accepted = Column(Boolean, nullable=True)                     # True/False — принят/отклонён получателем
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<PortalTask {self.id} {self.title!r} owner={self.owner} assignee={self.assignee}>"
