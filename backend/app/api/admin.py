"""
Admin router — управление разделами портала, пользователями и таблицей учёта телефонов.
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List

from app.api.deps import get_db
from app.api.auth import get_current_user, require_admin
from app.models import User, PortalSection, PhoneTableColumn, PhoneTableRow
from app.schemas import (
    SectionCreate, SectionUpdate, SectionResponse,
    UserAdminUpdate, UserAdminCreate,
    PhoneColCreate, PhoneRowCreate,
)
from app.services.auth_service import hash_password

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
)


# ==================== Разделы портала ====================

@router.get("/sections", response_model=List[SectionResponse])
def list_sections(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(PortalSection).order_by(PortalSection.sort_order).all()


@router.post("/sections", response_model=SectionResponse)
def create_section(payload: SectionCreate, user=Depends(require_admin), db: Session = Depends(get_db)):
    sec = PortalSection(**payload.model_dump())
    db.add(sec)
    db.commit()
    db.refresh(sec)
    return sec


@router.patch("/sections/{section_id}", response_model=SectionResponse)
def update_section(section_id: int, payload: SectionUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    sec = db.get(PortalSection, section_id)
    if not sec:
        raise HTTPException(404, "Раздел не найден")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(sec, field, value)
    db.commit()
    db.refresh(sec)
    return sec


@router.delete("/sections/{section_id}")
def delete_section(section_id: int, user=Depends(require_admin), db: Session = Depends(get_db)):
    sec = db.get(PortalSection, section_id)
    if not sec:
        raise HTTPException(404, "Раздел не найден")
    db.delete(sec)
    db.commit()
    return {"status": "ok"}


# ==================== Пользователи ====================

@router.get("/users")
def list_users(user=Depends(require_admin), db: Session = Depends(get_db)):
    return [
        {
            "id": u.id, "username": u.username, "full_name": u.full_name,
            "email": u.email, "department": u.department, "position": u.position,
            "birth_date": u.birth_date, "role": u.role, "is_domain": bool(u.is_domain),
            "disabled": bool(u.disabled),
            "ad_groups": json.loads(u.ad_groups) if u.ad_groups else [],
            "visible_sections": json.loads(u.visible_sections) if u.visible_sections else None,
        }
        for u in db.query(User).order_by(User.username).all()
    ]


@router.patch("/users/{user_id}")
def update_user(user_id: int, payload: UserAdminUpdate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    updates = payload.model_dump(exclude_unset=True)
    if "role" in updates:
        if updates["role"] not in ("admin", "employee"):
            raise HTTPException(400, "Роль: admin | employee")
        if u.id == admin.id and updates["role"] != "admin":
            raise HTTPException(400, "Нельзя снять роль admin с себя")
        u.role = updates["role"]
    if "disabled" in updates:
        if u.id == admin.id and updates["disabled"]:
            raise HTTPException(400, "Нельзя заблокировать себя")
        u.disabled = updates["disabled"]
    if "password" in updates and updates["password"]:
        u.password_hash = hash_password(updates["password"])
    for f in ("full_name", "email", "department", "position", "birth_date"):
        if f in updates:
            setattr(u, f, updates[f])
    if "visible_sections" in updates:
        vs = updates["visible_sections"]
        u.visible_sections = json.dumps(vs, ensure_ascii=False) if vs else None
    db.commit()
    return {"status": "ok"}


@router.post("/users")
def create_user(payload: UserAdminCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(400, "Логин и пароль обязательны")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "Пользователь уже существует")
    u = User(
        username=username,
        full_name=payload.full_name or username,
        email=payload.email or f"{username}@{__import__('app.core.config', fromlist=['settings']).settings.MAIL_DOMAIN}",
        department=payload.department,
        position=payload.position,
        role=payload.role if payload.role in ("admin", "employee") else "employee",
        password_hash=hash_password(payload.password),
        is_domain=False,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"id": u.id, "username": u.username}


@router.post("/users/import-ad")
def import_ad_users(payload: dict, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """
    Импорт/синхронизация пользователей из домена.
    payload: {"users": [{username, full_name, email, department, position, is_admin}...], "replace_roles": false}
    replace_roles=True — роли синхронизируются с флагом is_admin (иначе роли существующих не трогаем).
    """
    import json
    from app.core.config import settings
    incoming = (payload or {}).get("users") or []
    replace_roles = bool((payload or {}).get("replace_roles", False))
    created = updated = skipped = 0
    for u in incoming:
        username = (u.get("username") or "").strip()
        if not username:
            skipped += 1
            continue
        existing = db.query(User).filter(User.username == username).first()
        role = "admin" if u.get("is_admin") else "employee"
        if existing:
            changed = False
            for f in ("full_name", "email", "department", "position"):
                val = u.get(f)
                if val and getattr(existing, f) != val:
                    setattr(existing, f, val)
                    changed = True
            if u.get("groups") is not None:
                import json as _json
                val = _json.dumps(u.get("groups"), ensure_ascii=False)
                if existing.ad_groups != val:
                    existing.ad_groups = val
                    changed = True
            if replace_roles and existing.role != role:
                existing.role = role
                changed = True
            existing.is_domain = True
            if changed:
                updated += 1
        else:
            db.add(User(
                username=username,
                full_name=u.get("full_name") or username,
                email=u.get("email") or f"{username}@{settings.MAIL_DOMAIN}",
                department=u.get("department"),
                position=u.get("position"),
                role=role,
                is_domain=True,
                ad_groups=(json.dumps(u.get("groups"), ensure_ascii=False) if u.get("groups") else None),
            ))
            created += 1
    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}


# ==================== Таблица учёта телефонов ====================

@router.get("/phonetable")
def get_table(user=Depends(get_current_user), db: Session = Depends(get_db)):
    cols = [
        {"id": c.id, "name": c.name, "sort_order": c.sort_order}
        for c in db.query(PhoneTableColumn).order_by(PhoneTableColumn.sort_order, PhoneTableColumn.id).all()
    ]
    rows = [
        {"id": r.id, "data": json.loads(r.data or "{}")}
        for r in db.query(PhoneTableRow).all()
    ]
    return {"columns": cols, "rows": rows}


@router.post("/phonetable/columns")
def add_column(payload: PhoneColCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    col = PhoneTableColumn(name=payload.name, sort_order=payload.sort_order)
    db.add(col)
    db.commit()
    db.refresh(col)
    return {"id": col.id, "name": col.name}


@router.patch("/phonetable/columns/{col_id}")
def rename_column(col_id: int, payload: PhoneColCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    col = db.get(PhoneTableColumn, col_id)
    if not col:
        raise HTTPException(404, "Колонка не найдена")
    col.name = payload.name
    db.commit()
    return {"status": "ok"}


@router.delete("/phonetable/columns/{col_id}")
def delete_column(col_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    col = db.get(PhoneTableColumn, col_id)
    if not col:
        raise HTTPException(404, "Колонка не найдена")
    # убираем значения колонки из всех строк
    for r in db.query(PhoneTableRow).all():
        data = json.loads(r.data or "{}")
        if str(col_id) in data:
            del data[str(col_id)]
            r.data = json.dumps(data, ensure_ascii=False)
    db.delete(col)
    db.commit()
    return {"status": "ok"}


@router.post("/phonetable/rows")
def add_row(payload: PhoneRowCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    row = PhoneTableRow(data=json.dumps(payload.data, ensure_ascii=False))
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.patch("/phonetable/rows/{row_id}")
def update_row(row_id: int, payload: PhoneRowCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(PhoneTableRow, row_id)
    if not row:
        raise HTTPException(404, "Строка не найдена")
    row.data = json.dumps(payload.data, ensure_ascii=False)
    db.commit()
    return {"status": "ok"}


@router.delete("/phonetable/rows/{row_id}")
def delete_row(row_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(PhoneTableRow, row_id)
    if not row:
        raise HTTPException(404, "Строка не найдена")
    db.delete(row)
    db.commit()
    return {"status": "ok"}
