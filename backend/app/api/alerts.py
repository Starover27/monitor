"""
Alerts router - список инцидентов
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List

from app.api.deps import get_db
from app.models import Alert
from app.schemas import AlertResponse

router = APIRouter(
    prefix="/alerts",
    tags=["Alerts"],
)


@router.get("", response_model=List[AlertResponse])
def get_alerts(
    limit: int = Query(100, ge=1, le=500, description="Количество последних алертов"),
    resolved: bool | None = Query(None, description="Фильтр: True=только закрытые, False=открытые, None=все"),
    db: Session = Depends(get_db),
):
    """
    Возвращает лог недавних инцидентов для фронтенда.
    Сортировка по дате создания (новые сверху).
    """
    query = db.query(Alert)
    
    if resolved is not None:
        query = query.filter(Alert.is_resolved == resolved)
    
    alerts = query.order_by(desc(Alert.created_at)).limit(limit).all()
    
    # Дополнительно подтягиваем имя и target сервиса для удобства
    result = []
    for alert in alerts:
        alert_dict = {
            "id": alert.id,
            "service_id": alert.service_id,
            "service_name": alert.service.name if alert.service else None,
            "service_target": alert.service.target if alert.service else None,
            "alert_type": alert.alert_type,
            "message": alert.message,
            "severity": alert.severity,
            "is_resolved": alert.is_resolved,
            "resolved_at": alert.resolved_at,
            "created_at": alert.created_at,
        }
        result.append(AlertResponse(**alert_dict))
    
    return result
