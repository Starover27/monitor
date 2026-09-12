"""
Heartbeat router - прием данных от агентов
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.api.deps import get_db, verify_agent_token
from app.models import Service, StatusHistory
from app.schemas import HeartbeatRequest, HeartbeatResponse

router = APIRouter(
    prefix="/heartbeat",
    tags=["Heartbeat"],
)


@router.post("", response_model=HeartbeatResponse)
def process_heartbeat(
    payload: HeartbeatRequest,
    db: Session = Depends(get_db),
    _token: str = Depends(verify_agent_token),
):
    """
    Принимает JSON от агента с результатом проверки сервиса.
    
    Логика:
    1. Находит сервис по service_id.
    2. Записывает результат в status_history.
    3. Обновляет денормализованный current_status в таблице services.
    
    Примечание: генерация алертов вынесена в фоновую задачу (alert_detector),
    которая проверяет последовательность статусов. Здесь только сохранение данных.
    """
    # 1. Поиск сервиса
    service = db.query(Service).filter(Service.id == payload.service_id).first()
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id={payload.service_id} not found",
        )

    # 2. Запись в историю
    history_entry = StatusHistory(
        service_id=service.id,
        status=payload.status,
        latency_ms=payload.latency_ms,
        error_message=payload.error_message,
        checked_at=payload.timestamp,
        metric_value=payload.metric_value,
        metric_unit=payload.metric_unit,
    )
    db.add(history_entry)

    # 3. Обновляем денормализованный статус сервиса
    checked_at = payload.timestamp
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=timezone.utc)

    service.current_status = payload.status
    service.last_latency_ms = payload.latency_ms
    service.last_checked_at = checked_at
    
    # Обновляем метрики
    if payload.metric_value is not None:
        service.last_metric_value = payload.metric_value
        service.metric_unit = payload.metric_unit

    db.commit()
    db.refresh(history_entry)

    return HeartbeatResponse(
        success=True,
        message="Heartbeat recorded",
        service_id=service.id,
    )
