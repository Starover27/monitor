"""
Analytics router — сбор и отображение метрик использования портала.
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.deps import get_db
from app.models import User, UserActivity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _track(db: Session, user_id: Optional[int], event_type: str, path: Optional[str], meta: Optional[dict] = None):
    entry = UserActivity(user_id=user_id, event_type=event_type, path=path, meta=json.dumps(meta, ensure_ascii=False) if meta else None)
    db.add(entry)
    db.commit()


@router.post("/event")
def track_event(
    event_type: str = Query(...),
    path: Optional[str] = Query(None),
    meta: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Записать событие пользователя (страница, действие)."""
    try:
        m = json.loads(meta) if meta else None
    except (ValueError, TypeError):
        m = None
    _track(db, user.id, event_type, path, m)
    return {"ok": True}


@router.get("/dashboard")
def dashboard(days: int = Query(7, ge=1, le=90), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(403, "Только для администраторов")
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Авторизации
    logins = (
        db.query(func.date(UserActivity.created_at).label("d"), func.count().label("c"))
        .filter(UserActivity.event_type == "login", UserActivity.created_at >= since)
        .group_by(func.date(UserActivity.created_at))
        .order_by(func.date(UserActivity.created_at))
        .all()
    )
    # Популярные разделы
    sections = (
        db.query(UserActivity.path, func.count().label("c"))
        .filter(UserActivity.event_type.in_(["page_view", "section_open"]), UserActivity.created_at >= since)
        .group_by(UserActivity.path)
        .order_by(func.count().desc())
        .limit(15)
        .all()
    )
    # Самые активные пользователи
    users = (
        db.query(User.full_name, User.username, func.count().label("c"))
        .join(UserActivity, User.id == UserActivity.user_id, isouter=True)
        .filter(UserActivity.created_at >= since)
        .group_by(User.id)
        .order_by(func.count().desc())
        .limit(15)
        .all()
    )
    # Заявки в IT за период
    from app.models import HelpdeskTicket
    tickets = db.query(func.count()).select_from(HelpdeskTicket).filter(HelpdeskTicket.created_at >= since).scalar() or 0
    # Новости: создано / прочитано
    news_created = db.query(func.count()).select_from(UserActivity).filter(UserActivity.event_type == "news_created", UserActivity.created_at >= since).scalar() or 0
    news_read = db.query(func.count()).select_from(UserActivity).filter(UserActivity.event_type == "news_read", UserActivity.created_at >= since).scalar() or 0
    # Уникальных пользователей за период
    unique_users = db.query(func.count(func.distinct(UserActivity.user_id))).filter(UserActivity.created_at >= since).scalar() or 0

    return {
        "days": days,
        "since": since.isoformat(),
        "logins": [{"date": str(r.d), "count": r.c} for r in logins],
        "sections": [{"path": r[0] or "—", "count": r[1]} for r in sections],
        "users": [{"full_name": r[0] or r[1], "username": r[1], "count": r[2]} for r in users],
        "tickets": tickets,
        "news_created": news_created,
        "news_read": news_read,
        "unique_users": unique_users,
    }
