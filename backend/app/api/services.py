"""
Services router - список и CRUD сервисов
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.api.deps import get_db
from app.models import Service
from app.schemas import ServiceCreate, ServiceResponse, ServiceUpdate, ServiceGroupingUpdate

router = APIRouter(
    prefix="/services",
    tags=["Services"],
)


@router.get("", response_model=List[ServiceResponse])
def get_services(
    enabled_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Возвращает список всех сервисов с их текущим статусом для фронтенда.
    Данные берутся из денормализованных полей (current_status, last_latency_ms),
    поэтому запрос быстрый даже при больших объемах истории.
    """
    query = db.query(Service)
    if enabled_only:
        query = query.filter(Service.enabled == True)
    services = query.order_by(Service.group_name, Service.sort_order, Service.name).offset(skip).limit(limit).all()
    return services


@router.post("", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCreate,
    db: Session = Depends(get_db),
):
    """Создает новый мониторимый сервис."""
    # Проверка уникальности имени
    existing = db.query(Service).filter(Service.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Service with name '{payload.name}' already exists",
        )

    service = Service(
        name=payload.name,
        target=payload.target,
        check_type=payload.check_type,
        enabled=payload.enabled,
        current_status="unknown",
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.get("/{service_id}", response_model=ServiceResponse)
def get_service(
    service_id: int,
    db: Session = Depends(get_db),
):
    """Возвращает детали одного сервиса."""
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id={service_id} not found",
        )
    return service


@router.patch("/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: int,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
):
    """Обновляет сервис (включая группировку)."""
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id={service_id} not found",
        )
    
    # Обновляем только переданные поля
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(service, field, value)
    
    db.commit()
    db.refresh(service)
    return service


@router.post("/grouping", response_model=List[ServiceResponse])
def update_grouping(
    updates: List[ServiceGroupingUpdate],
    db: Session = Depends(get_db),
):
    """
    Массовое обновление группировки сервисов (для drag-and-drop).
    Принимает список [{id, group_name, sort_order}, ...] и обновляет все за один запрос.
    """
    service_ids = [u.id for u in updates]
    services = db.query(Service).filter(Service.id.in_(service_ids)).all()
    
    if len(services) != len(updates):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Some services not found",
        )
    
    # Создаём map для быстрого поиска
    service_map = {s.id: s for s in services}
    
    for update in updates:
        service = service_map.get(update.id)
        if service:
            service.group_name = update.group_name
            service.sort_order = update.sort_order
    
    db.commit()
    
    # Возвращаем обновлённый список всех сервисов (для рефреша UI)
    all_services = db.query(Service).all()
    return all_services


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
):
    """Удаляет сервис и связанную историю (каскадно)."""
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id={service_id} not found",
        )
    db.delete(service)
    db.commit()
    return None
