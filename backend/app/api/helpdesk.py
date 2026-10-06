"""
Helpdesk router — заявки: создание сотрудниками, обработка админами, трекер событий
"""
import json
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.api.deps import get_db
from app.models import HelpdeskTicket, TicketEvent, User
from app.schemas import TicketCreate, TicketUpdate, TicketResponse, TicketEventCreate
from app.services.mail_notifier import mail_notifier

router = APIRouter(
    prefix="/helpdesk",
    tags=["Helpdesk"],
)

ALLOWED_STATUSES = {"new", "in_progress", "done", "cancelled"}


def _add_event(db: Session, ticket: HelpdeskTicket, author: str, message: str) -> None:
    db.add(TicketEvent(ticket_id=ticket.id, author=author, message=message))


@router.get("", response_model=List[TicketResponse])
def list_tickets(
    status: Optional[str] = Query(None, description="Фильтр по статусу"),
    employee: Optional[str] = Query(None, description="Фильтр по ФИО сотрудника (его заявки)"),
    q: Optional[str] = Query(None, description="Поиск по теме/описанию"),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    query = db.query(HelpdeskTicket)
    if status:
        query = query.filter(HelpdeskTicket.status == status)
    if employee:
        query = query.filter(HelpdeskTicket.employee_name.ilike(f"%{employee}%"))
    if q:
        like = f"%{q}%"
        query = query.filter(HelpdeskTicket.title.ilike(like) | HelpdeskTicket.description.ilike(like))
    return query.order_by(HelpdeskTicket.created_at.desc()).limit(limit).all()


@router.post("", response_model=TicketResponse)
def create_ticket(payload: TicketCreate, db: Session = Depends(get_db)):
    ticket = HelpdeskTicket(**payload.model_dump(), status="new")
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    _add_event(db, ticket, payload.employee_name, "Заявка создана")
    db.commit()
    db.refresh(ticket)

    # Email-уведомление администраторам о новой заявке
    mail_notifier.notify_admins_ticket_created(
        ticket_id=ticket.id, title=ticket.title,
        category=ticket.category, priority=ticket.priority,
        employee=ticket.employee_name, room=ticket.employee_room or "",
        description=ticket.description or "",
    )
    # аналитика: создана заявка в IT (не ломаем создание, если авторизация отсутствует)
    try:
        from app.api.auth import get_current_user
        from app.models import UserActivity
        # заявки создаёт сам сотрудник без токена — пишем без user_id, но с мета-данными
        db.add(UserActivity(user_id=None, event_type="ticket_created", path="/helpdesk",
                            meta=json.dumps({"ticket_id": ticket.id, "employee": ticket.employee_name}, ensure_ascii=False)))
        db.commit()
    except Exception:
        db.rollback()
    return ticket


@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.get(HelpdeskTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")
    return ticket


@router.patch("/{ticket_id}", response_model=TicketResponse)
def update_ticket(ticket_id: int, payload: TicketUpdate, db: Session = Depends(get_db)):
    ticket = db.get(HelpdeskTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")

    updates = payload.model_dump(exclude_unset=True)
    author = updates.pop("assignee", None) or "Администратор"
    comment = updates.pop("comment", None)

    new_status = updates.get("status")
    if new_status and new_status not in ALLOWED_STATUSES:
        raise HTTPException(400, f"Недопустимый статус: {new_status}")

    old_status = ticket.status
    for field, value in updates.items():
        setattr(ticket, field, value)

    events = []
    if new_status and new_status != old_status:
        if new_status in ("done", "cancelled"):
            from sqlalchemy.sql import func
            ticket.closed_at = func.now()
        else:
            ticket.closed_at = None
        labels = {"new": "Новая", "in_progress": "В работе", "done": "Выполнена", "cancelled": "Отменена"}
        events.append(f"Статус изменён: {labels.get(new_status, new_status)}")
        if new_status == "in_progress" and not ticket.assignee:
            ticket.assignee = author

    if comment:
        events.append(comment)

    db.commit()
    for ev in events:
        _add_event(db, ticket, author, ev)
    db.commit()
    db.refresh(ticket)

    # Email-уведомление сотруднику о смене статуса
    if new_status and new_status != old_status:
        emp = db.query(User).filter(User.username == ticket.employee_name).first()
        if not emp:
            from app.models import PhoneBookEntry
            entry = db.query(PhoneBookEntry).filter(PhoneBookEntry.full_name == ticket.employee_name).first()
            email = entry.email if entry else None
        else:
            email = emp.email
        mail_notifier.notify_ticket_status(email, ticket.id, ticket.title, new_status)
    return ticket


@router.post("/{ticket_id}/events", response_model=TicketResponse)
def add_event(ticket_id: int, payload: TicketEventCreate, db: Session = Depends(get_db)):
    ticket = db.get(HelpdeskTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")
    if not payload.message.strip():
        raise HTTPException(400, "Пустой комментарий")
    _add_event(db, ticket, payload.author or "Сотрудник", payload.message.strip())
    db.commit()
    db.refresh(ticket)
    return ticket
