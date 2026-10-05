"""
Birthdays router — дни рождения сотрудников (отметки в календаре-органайзере).
"""
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, require_admin
from app.api.deps import get_db
from app.models import Birthday, User

router = APIRouter(prefix="/birthdays", tags=["Birthdays"])

_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def _check_date(value: str) -> str:
    m = _DATE_RE.match(str(value or "").strip())
    if not m:
        raise HTTPException(400, "Дата рождения в формате ГГГГ-ММ-ДД")
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12 and 1 <= d <= 31 and 1900 <= y <= 2100):
        raise HTTPException(400, "Некорректная дата рождения")
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"


def _out(b: Birthday) -> dict:
    return {"id": b.id, "full_name": b.full_name, "birth_date": b.birth_date,
            "position": b.position or ""}


@router.get("", response_model=List[dict])
def list_birthdays(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Birthday).order_by(Birthday.full_name).all()
    return [_out(b) for b in rows]


@router.post("", status_code=201)
def add_birthday(payload: dict, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    """{full_name, birth_date: "ГГГГ-ММ-ДД", position?}"""
    name = str((payload or {}).get("full_name") or "").strip()
    if not name:
        raise HTTPException(400, "Укажите ФИО")
    date = _check_date((payload or {}).get("birth_date"))
    dup = db.query(Birthday).filter(Birthday.full_name == name, Birthday.birth_date == date).first()
    if dup:
        raise HTTPException(400, "Такая запись уже есть")
    b = Birthday(full_name=name, birth_date=date,
                 position=str((payload or {}).get("position") or "").strip() or None)
    db.add(b)
    db.commit()
    db.refresh(b)
    return _out(b)


@router.delete("/{birthday_id}")
def delete_birthday(birthday_id: int, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    b = db.get(Birthday, birthday_id)
    if not b:
        raise HTTPException(404, "Запись не найдена")
    db.delete(b)
    db.commit()
    return {"status": "ok"}
