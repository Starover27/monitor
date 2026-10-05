"""
Messages router — внутренняя переписка между пользователями портала.

Эндпоинты:
  GET  /messages/users            — список собеседников (все пользователи, кроме себя)
  GET  /messages/inbox            — входящие
  GET  /messages/sent             — исходящие
  GET  /messages/unread-count     — кол-во непрочитанных (для бейджа)
  POST /messages                  — отправить {recipient_id, subject, body}
  POST /messages/{id}/read        — отметить прочитанным
  DELETE /messages/{id}           — удалить (мягко: для себя)
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session, aliased

from app.api.auth import get_current_user
from app.api.deps import get_db
from app.models import Message, User
from app.schemas import MessageCreate, MessageResponse

router = APIRouter(
    prefix="/messages",
    tags=["Messages"],
)


def _to_dict(m: Message, me: User) -> dict:
    other = m.sender if m.sender_id != me.id else m.recipient
    return {
        "id": m.id,
        "sender_id": m.sender_id,
        "sender_name": m.sender.full_name if m.sender else None,
        "recipient_id": m.recipient_id,
        "recipient_name": m.recipient.full_name if m.recipient else None,
        "subject": m.subject,
        "body": m.body,
        "read_at": m.read_at,
        "created_at": m.created_at,
        "outgoing": m.sender_id == me.id,
        "partner_id": other.id if other else None,
        "partner_name": (other.full_name or other.username) if other else "?",
    }


@router.get("/users")
def list_partners(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Пользователи, которым можно писать."""
    users = db.query(User).filter(User.id != me.id, User.disabled == False).order_by(User.username).all()  # noqa: E712
    return [
        {"id": u.id, "username": u.username, "full_name": u.full_name or u.username, "role": u.role}
        for u in users
    ]


@router.get("/inbox")
def inbox(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    msgs = (
        db.query(Message)
        .filter(Message.recipient_id == me.id, Message.deleted_by_recipient == False)  # noqa: E712
        .order_by(Message.created_at.desc())
        .all()
    )
    return [_to_dict(m, me) for m in msgs]


@router.get("/sent")
def sent(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    msgs = (
        db.query(Message)
        .filter(Message.sender_id == me.id, Message.deleted_by_sender == False)  # noqa: E712
        .order_by(Message.created_at.desc())
        .all()
    )
    return [_to_dict(m, me) for m in msgs]


@router.get("/unread-count")
def unread_count(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = (
        db.query(Message)
        .filter(Message.recipient_id == me.id, Message.read_at.is_(None),
                Message.deleted_by_recipient == False)  # noqa: E712
        .count()
    )
    return {"count": n}


@router.post("", response_model=dict)
def send_message(payload: MessageCreate, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(400, "Пустое сообщение")
    if payload.recipient_id == me.id:
        raise HTTPException(400, "Нельзя отправить сообщение самому себе")
    recipient = db.get(User, payload.recipient_id)
    if not recipient:
        raise HTTPException(404, "Получатель не найден")
    m = Message(sender_id=me.id, recipient_id=recipient.id, subject=payload.subject, body=body)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _to_dict(m, me)


@router.post("/{message_id}/read")
def mark_read(message_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(Message, message_id)
    if not m or m.recipient_id != me.id:
        raise HTTPException(404, "Сообщение не найдено")
    if not m.read_at:
        m.read_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": "ok"}


@router.delete("/{message_id}")
def delete_message(message_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(Message, message_id)
    if not m:
        raise HTTPException(404, "Сообщение не найдено")
    if m.recipient_id == me.id:
        m.deleted_by_recipient = True
    elif m.sender_id == me.id:
        m.deleted_by_sender = True
    else:
        raise HTTPException(403, "Нет доступа")
    db.commit()
    return {"status": "ok"}
