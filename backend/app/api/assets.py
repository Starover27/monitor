"""
Assets router — раздел «Инвентаризация» в мониторинге:
категории (Сотовые телефоны / Терминалы / Техника), настраиваемые поля,
записи (строки) и заполнение значений полей.
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, require_admin
from app.api.deps import get_db
from app.models import AssetCategory, AssetField, AssetItem, User

router = APIRouter(prefix="/assets", tags=["Assets"])

# Стартовые категории и их поля (создаются один раз)
DEFAULT_CATEGORIES = [
    ("Связь", "📡", [
        "Тип устройства",
        "IP адрес",
        "MAC адрес",
        "Место установки",
        "Серийный номер",
        "Статус",
        "Примечание",
    ]),
    ("Терминалы", "🖥", [
        "Название",
        "Адрес (корпус/кабинет)",
        "Хост/IP",
        "Модель",
        "Установленное ПО",
        "Назначение",
        "Ответственный",
        "Примечание",
    ]),
    ("Техника", "🖨", [
        "Наименование",
        "Модель",
        "Серийный номер",
        "Где используется",
        "Ответственный",
        "Дата ввода в эксплуатацию",
        "Статус",
        "Примечание",
    ]),
]


def _seed_categories(db: Session):
    if db.query(AssetCategory).count() > 0:
        return
    order = 0
    for name, icon, fields in DEFAULT_CATEGORIES:
        cat = AssetCategory(name=name, icon=icon, sort_order=order)
        db.add(cat)
        db.flush()
        for i, fname in enumerate(fields):
            db.add(AssetField(category_id=cat.id, name=fname, sort_order=i))
        order += 1
    db.commit()


def _out_category(db: Session, c: AssetCategory) -> dict:
    fields = db.query(AssetField).filter(AssetField.category_id == c.id).order_by(AssetField.sort_order).all()
    count = db.query(AssetItem).filter(AssetItem.category_id == c.id).count()
    return {
        "id": c.id, "name": c.name, "icon": c.icon or "",
        "fields": [{"id": f.id, "name": f.name} for f in fields],
        "items_count": count,
    }


def _out_item(i: AssetItem) -> dict:
    try:
        data = json.loads(i.data or "{}")
    except (ValueError, TypeError):
        data = {}
    return {"id": i.id, "category_id": i.category_id, "data": data}


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    _seed_categories(db)
    rows = db.query(AssetCategory).order_by(AssetCategory.sort_order).all()
    return [_out_category(db, c) for c in rows]


@router.post("/fields", status_code=201)
def add_field(payload: dict, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Добавить поле в категорию (админ): {category_id, name}."""
    _seed_categories(db)
    name = str((payload or {}).get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Укажите название поля")
    try:
        cat_id = int((payload or {}).get("category_id"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Укажите категорию")
    cat = db.get(AssetCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    dup = db.query(AssetField).filter(AssetField.category_id == cat.id, AssetField.name == name).first()
    if dup:
        raise HTTPException(400, "Поле с таким именем уже есть")
    last = db.query(AssetField.sort_order).filter(AssetField.category_id == cat.id).order_by(AssetField.sort_order.desc()).first()
    f = AssetField(category_id=cat.id, name=name, sort_order=(last[0] or -1) + 1)
    db.add(f)
    db.commit()
    db.refresh(f)
    return {"id": f.id, "name": f.name}


@router.delete("/fields/{field_id}")
def delete_field(field_id: int, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Удалить поле из категории (админ). Значения поля в записях тоже удаляются."""
    f = db.get(AssetField, field_id)
    if not f:
        raise HTTPException(404, "Поле не найдено")
    for item in db.query(AssetItem).filter(AssetItem.category_id == f.category_id).all():
        try:
            data = json.loads(item.data or "{}")
        except (ValueError, TypeError):
            data = {}
        data.pop(str(f.id), None)
        item.data = json.dumps(data, ensure_ascii=False)
    db.delete(f)
    db.commit()
    return {"status": "ok"}


@router.get("/items")
def list_items(
    category_id: int = Query(...),
    q: Optional[str] = Query(None, description="Поиск по значениям всех полей"),
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _seed_categories(db)
    items = db.query(AssetItem).filter(AssetItem.category_id == category_id).all()
    result = [_out_item(i) for i in items]
    if q:
        needle = q.strip().lower()
        result = [
            i for i in result
            if any(needle in str(v).lower() for v in i["data"].values())
        ]
    return result


@router.post("/items", status_code=201)
def create_item(payload: dict, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Новая запись: {category_id, data: {"<field_id>": "значение"}}."""
    _seed_categories(db)
    try:
        cat_id = int((payload or {}).get("category_id"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Укажите категорию")
    if not db.get(AssetCategory, cat_id):
        raise HTTPException(404, "Категория не найдена")
    raw = (payload or {}).get("data") or {}
    if not isinstance(raw, dict):
        raise HTTPException(400, "data должен быть объектом {field_id: значение}")
    data = {str(k): str(v).strip() for k, v in raw.items() if str(v or "").strip() != ""}
    item = AssetItem(category_id=cat_id, data=json.dumps(data, ensure_ascii=False))
    db.add(item)
    db.commit()
    db.refresh(item)
    return _out_item(item)


@router.patch("/items/{item_id}")
def update_item(item_id: int, payload: dict, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Обновить значения записи: {data: {"<field_id>": "значение"}}."""
    item = db.get(AssetItem, item_id)
    if not item:
        raise HTTPException(404, "Запись не найдена")
    raw = (payload or {}).get("data")
    if not isinstance(raw, dict):
        raise HTTPException(400, "data должен быть объектом {field_id: значение}")
    try:
        current = json.loads(item.data or "{}")
    except (ValueError, TypeError):
        current = {}
    for k, v in raw.items():
        s = str(v or "").strip()
        if s == "":
            current.pop(str(k), None)
        else:
            current[str(k)] = s
    item.data = json.dumps(current, ensure_ascii=False)
    db.commit()
    return _out_item(item)


@router.delete("/items/{item_id}")
def delete_item(item_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(AssetItem, item_id)
    if not item:
        raise HTTPException(404, "Запись не найдена")
    db.delete(item)
    db.commit()
    return {"status": "ok"}
