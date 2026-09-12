"""
History router - история статусов сервиса
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from datetime import datetime, timedelta, timezone

from app.api.deps import get_db
from app.models import Service, StatusHistory
from app.schemas import StatusHistoryResponse

router = APIRouter(
    prefix="/history",
    tags=["History"],
)


@router.get("/{service_id}", response_model=List[StatusHistoryResponse])
def get_history(
    service_id: int,
    hours: int = Query(24, ge=1, le=24, description="За какой период (в часах) взять историю"),
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    """
    Возвращает историю статусов сервиса за последние N часов (по умолчанию 24).
    Используется фронтендом для построения графика uptime и таблицы инцидентов.
    """
    # Проверяем существование сервиса
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id={service_id} not found",
        )

    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    history = (
        db.query(StatusHistory)
        .filter(
            StatusHistory.service_id == service_id,
            StatusHistory.checked_at >= since,
        )
        .order_by(desc(StatusHistory.checked_at))
        .limit(limit)
        .all()
    )
    return history
