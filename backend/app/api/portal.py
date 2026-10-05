"""
Portal router — заявления сотрудников (справка, отпуск, заявление)
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.api.deps import get_db
from app.models import PortalRequest, User
from app.schemas import PortalRequestCreate, PortalRequestUpdate, PortalRequestResponse
from app.services.mail_notifier import mail_notifier

router = APIRouter(
    prefix="/portal",
    tags=["Portal"],
)

ALLOWED_STATUSES = {"new", "in_progress", "done", "rejected"}
ALLOWED_KINDS = {
    "certificate", "vacation", "statement", "dayoff", "sick_leave",
    "business_trip", "material_aid", "personnel", "other",
}


@router.get("", response_model=List[PortalRequestResponse])
def list_requests(
    employee: Optional[str] = Query(None, description="Фильтр по ФИО сотрудника"),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(PortalRequest)
    if employee:
        query = query.filter(PortalRequest.employee_name.ilike(f"%{employee}%"))
    if status:
        query = query.filter(PortalRequest.status == status)
    return query.order_by(PortalRequest.created_at.desc()).limit(500).all()


@router.post("", response_model=PortalRequestResponse)
def create_request(payload: PortalRequestCreate, db: Session = Depends(get_db)):
    if payload.kind not in ALLOWED_KINDS:
        raise HTTPException(400, f"Недопустимый тип заявления: {payload.kind}")
    req = PortalRequest(**payload.model_dump(), status="new")
    db.add(req)
    db.commit()
    db.refresh(req)

    # Email-уведомление о новом заявлении
    mail_notifier.notify_admins_portal_request(
        request_id=req.id, kind=req.kind, employee=req.employee_name,
        date_from=req.date_from or "", date_to=req.date_to or "",
        details=req.details or "",
    )
    return req


@router.patch("/{request_id}", response_model=PortalRequestResponse)
def update_request(request_id: int, payload: PortalRequestUpdate, db: Session = Depends(get_db)):
    req = db.get(PortalRequest, request_id)
    if not req:
        raise HTTPException(404, "Заявление не найдено")
    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in ALLOWED_STATUSES:
        raise HTTPException(400, f"Недопустимый статус: {updates['status']}")
    for field, value in updates.items():
        setattr(req, field, value)
    db.commit()
    db.refresh(req)

    old = updates.get("status")
    if old:
        emp = db.query(User).filter(User.username == req.employee_name).first()
        if not emp:
            from app.models import PhoneBookEntry
            entry = db.query(PhoneBookEntry).filter(PhoneBookEntry.full_name == req.employee_name).first()
            email = entry.email if entry else None
        else:
            email = emp.email
        mail_notifier.notify_portal_status(email, req.id, req.kind, req.status, req.admin_comment or "")
    return req
