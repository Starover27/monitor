"""
Tasks router — органайзер: личные задачи + переадресация другим сотрудникам.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.api.auth import get_current_user
from app.api.deps import get_db
from app.models import PortalTask, User
from app.services.mail_notifier import mail_notifier

router = APIRouter(prefix="/tasks", tags=["Tasks"])


class TaskCreate(BaseModel):
    title: str
    details: Optional[str] = None
    due_date: Optional[str] = None
    assignee: Optional[str] = None   # ФИО сотрудника — если задано, задача переадресована
    assignees: Optional[List[str]] = None  # несколько получателей (галочки) — по одной задаче на каждого
    document_url: Optional[str] = None     # ссылка на внутренний документ (UNC-путь)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    details: Optional[str] = None
    due_date: Optional[str] = None
    done: Optional[bool] = None
    assignee: Optional[str] = None
    accepted: Optional[bool] = None


def _visible_to(me: User):
    """Задачи, видимые пользователю: мои ИЛИ переадресованные мне (по ФИО или логину)."""
    me_full = me.full_name or me.username
    return or_(
        PortalTask.owner == me_full,
        PortalTask.owner == me.username,
        PortalTask.assignee == me_full,
        PortalTask.assignee == me.username,
    )


def _out(t: PortalTask) -> dict:
    return {
        "id": t.id, "title": t.title, "details": t.details,
        "due_date": t.due_date, "document_url": t.document_url, "done": t.done,
        "owner": t.owner, "author": t.author,
        "assignee": t.assignee, "forwarded": t.forwarded, "accepted": t.accepted,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
def list_tasks(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tasks = db.query(PortalTask).filter(_visible_to(me)).order_by(
        PortalTask.done, PortalTask.due_date.is_(None), PortalTask.due_date, PortalTask.id.desc(),
    ).all()
    return [_out(t) for t in tasks]


@router.post("")
def create_task(payload: TaskCreate, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Создание задачи. Несколько получателей (assignees) -> по одной задаче на каждого."""
    name = me.full_name or me.username
    my_names = {n for n in (me.full_name, me.username, name) if n}
    # список получателей: галочки + одиночный assignee (назад совместимо)
    names = list(dict.fromkeys((payload.assignees or []) + ([payload.assignee] if payload.assignee else [])))
    names = [n.strip() for n in names if n and n.strip()]
    if not names:
        names = [name]  # никому не задано — задача себе
    # уникальность + не больше одной задачи себе
    created = []
    notified = []
    for target in names:
        is_self = target in my_names
        t = PortalTask(
            title=payload.title.strip(),
            details=(payload.details or "").strip() or None,
            due_date=payload.due_date or None,
            document_url=(payload.document_url or "").strip() or None,
            owner=name,
            author=name,
            assignee=None if is_self else target,
            forwarded=not is_self,
            accepted=None,
        )
        db.add(t)
        created.append(t)
        if not is_self:
            notified.append(target)
    db.commit()
    for t in created:
        db.refresh(t)
    # уведомления на почту получателям
    for target in notified:
        try:
            mail_notifier.notify_task_forwarded(
                to_user=target, title=payload.title.strip(), due_date=payload.due_date or "",
                author=name, document=payload.document_url or "",
            )
        except Exception:
            pass
    # единое окно списка получателей; при одном — возвращаем его
    return [_out(t) for t in created]


@router.patch("/{task_id}")
def update_task(task_id: int, payload: TaskUpdate, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(PortalTask, task_id)
    if not t:
        raise HTTPException(404, "Задача не найдена")
    name = me.full_name or me.username
    if t.owner != name and t.assignee != name:
        raise HTTPException(403, "Нет доступа к этой задаче")
    updates = payload.model_dump(exclude_unset=True)
    # владелец может менять всё; получатель переадресованной — только done/accepted
    if t.assignee == name and t.owner != name:
        for f in ("done", "accepted"):
            if f in updates:
                setattr(t, f, updates[f])
    else:
        for f, v in updates.items():
            if f == "assignee":
                forwarded = bool(v and v != name)
                t.assignee = v if forwarded else None
                t.forwarded = forwarded or t.forwarded
                if forwarded:
                    try:
                        mail_notifier.notify_task_forwarded(to_user=v, title=t.title, due_date=t.due_date or "", author=name)
                    except Exception:
                        pass
            else:
                setattr(t, f, v)
    db.commit()
    db.refresh(t)
    return _out(t)


@router.delete("/{task_id}")
def delete_task(task_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(PortalTask, task_id)
    if not t:
        raise HTTPException(404, "Задача не найдена")
    name = me.full_name or me.username
    if t.owner != name and t.assignee != name:
        raise HTTPException(403, "Нет доступа к этой задаче")
    db.delete(t)
    db.commit()
    return {"status": "ok"}


@router.get("/users")
def list_users_for_assign(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Кому можно назначить задачу: все активные пользователи портала (с отделами)."""
    rows = db.query(User).filter(User.disabled == False).order_by(User.department, User.full_name).all()  # noqa: E712
    return [
        {"id": u.id, "username": u.username, "full_name": u.full_name or u.username,
         "department": u.department or ""}
        for u in rows
    ]
