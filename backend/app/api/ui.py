"""
UI router — настройки внешнего вида портала (только для админов).

GET  /ui/settings     — текущие настройки (для всех, применяется на портале)
PUT  /ui/settings     — сохранить (admin)
POST /ui/upload       — загрузить файл (логотип/фон), multipart -> /static/ui/
"""
import os
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, require_admin
from app.api.deps import get_db
from app.models import UISetting, User
from app.schemas import UISettingsResponse

router = APIRouter(
    prefix="/ui",
    tags=["UI"],
)

ALLOWED_KEYS = {"LOGO_PATH", "HERO_BG_IMAGE", "HERO_BG_OPACITY", "HERO_BG_BLUR", "HERO_TITLE_COLOR", "PANEL_BG"}
STATIC_UI_DIR = os.path.join("static", "ui")
ALLOWED_IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}


def get_ui_settings(db: Session) -> dict:
    rows = {s.key: s.value for s in db.query(UISetting).all()}
    out = {k: rows.get(k, "") for k in ALLOWED_KEYS}
    return out


@router.get("/settings")
def read_ui_settings(db: Session = Depends(get_db)):
    return get_ui_settings(db)


@router.put("/settings")
def update_ui_settings(payload: dict, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    for key, value in (payload or {}).items():
        if key not in ALLOWED_KEYS:
            continue
        value = str(value or "").strip()
        row = db.get(UISetting, key)
        if row:
            row.value = value
        else:
            db.add(UISetting(key=key, value=value))
    db.commit()
    return get_ui_settings(db)


@router.post("/upload")
def upload_ui_image(file: UploadFile = File(...), admin: User = Depends(require_admin)):
    """Загрузка логотипа или фона. Возвращает путь для /static/ui/..."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMG_EXT:
        raise HTTPException(400, f"Допустимые форматы: {', '.join(sorted(ALLOWED_IMG_EXT))}")
    os.makedirs(STATIC_UI_DIR, exist_ok=True)
    fname = f"{uuid.uuid4().hex[:12]}{ext}"
    dest = os.path.join(STATIC_UI_DIR, fname)
    content = file.file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Файл больше 5 МБ")
    with open(dest, "wb") as f:
        f.write(content)
    return {"path": f"/static/ui/{fname}"}
