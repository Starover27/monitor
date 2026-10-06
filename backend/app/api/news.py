"""
News router — новости клиники (лента на главной, управление в админ-панели).
Картинки: POST /news/image (multipart) -> backend/static/news/, путь /static/news/...;
статика раздаётся FastAPI (main.py: /static) и проксируется Vite.
"""
import json
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List

from app.api.deps import get_db
from app.api.auth import get_current_user, require_admin
from app.models import News
from app.schemas import NewsCreate, NewsUpdate, NewsResponse


def _sanitize_html(html: str) -> str:
    """Санитизация WYSIWYG-HTML: разрешаем типографику, списки, ссылки, картинки;
    вырезаем скрипты, обработчики событий, style=javascript: и пр."""
    import re as _re
    if not html:
        return ""
    # вырезаем script/iframe/object/embed целиком
    html = _re.sub(r"<\s*(script|iframe|object|embed|link|meta)[^>]*>.*?<\s*/\s*\1\s*>", "", html, flags=_re.S | _re.I)
    html = _re.sub(r"<\s*(script|iframe|object|embed|link|meta)[^>]*/?>", "", html, flags=_re.I)
    # вырезаем on* обработчики
    html = _re.sub(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", html, flags=_re.I)
    # javascript: в href/src
    html = _re.sub(r"(href|src)\s*=\s*(['\"]?)\s*javascript:[^'\"]*\2", r"\1=#", html, flags=_re.I)
    return html.strip()

router = APIRouter(
    prefix="/news",
    tags=["News"],
)

STATIC_NEWS_DIR = os.path.join("static", "news")
ALLOWED_IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def _image_path(db_news_image: str) -> str:
    """Путь на диске из значения в БД (/static/news/x.png -> static/news/x.png)."""
    rel = db_news_image.replace("/static/", "", 1).replace("/", os.sep)
    return os.path.join("static", rel)


@router.get("", response_model=List[NewsResponse])
def list_news(limit: int = Query(10, ge=1, le=50), user=Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(News)
        .order_by(News.pinned.desc(), News.created_at.desc())
        .limit(limit)
        .all()
    )


@router.post("", response_model=NewsResponse)
def create_news(payload: NewsCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    if not payload.title.strip():
        raise HTTPException(400, "Укажите заголовок")
    news = News(title=payload.title.strip(), body=payload.body,
                body_html=_sanitize_html(payload.body_html or ""), image=payload.image,
                author=admin.full_name or admin.username,
                pinned=1 if payload.pinned else 0)
    db.add(news)
    db.commit()
    db.refresh(news)
    # аналитика: кто создал новость
    try:
        from app.models import UserActivity
        db.add(UserActivity(user_id=admin.id, event_type="news_created", path="/portal",
                            meta=json.dumps({"news_id": news.id, "title": news.title}, ensure_ascii=False)))
        db.commit()
    except Exception:
        db.rollback()
    return news


@router.patch("/{news_id}", response_model=NewsResponse)
def update_news(news_id: int, payload: NewsUpdate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    news = db.get(News, news_id)
    if not news:
        raise HTTPException(404, "Новость не найдена")
    updates = payload.model_dump(exclude_unset=True)
    if "body_html" in updates:
        updates["body_html"] = _sanitize_html(updates["body_html"] or "")
    if "pinned" in updates:
        news.pinned = 1 if updates.pop("pinned") else 0
    old_image = news.image
    for field, value in updates.items():
        setattr(news, field, value)
    db.commit()
    db.refresh(news)
    # при замене картинки удаляем старый файл
    if "image" in updates and old_image and old_image != news.image:
        try:
            os.remove(_image_path(old_image))
        except OSError:
            pass
    return news


@router.post("/image")
async def upload_image(file: UploadFile = File(...), admin=Depends(require_admin)):
    """Загрузка картинки новости: сохраняем в static/news, возвращаем путь."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMG_EXT:
        raise HTTPException(400, "Разрешены форматы: png, jpg, jpeg, gif, webp")
    if (await file.read(1)) == b"":
        raise HTTPException(400, "Пустой файл")
    await file.seek(0)
    os.makedirs(STATIC_NEWS_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex[:12]}{ext}"
    path = os.path.join(STATIC_NEWS_DIR, name)
    with open(path, "wb") as f:
        f.write(await file.read())
    return {"path": f"/static/news/{name}"}


@router.delete("/{news_id}")
def delete_news(news_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    news = db.get(News, news_id)
    if not news:
        raise HTTPException(404, "Новость не найдена")
    if news.image:
        try:
            os.remove(_image_path(news.image))
        except OSError:
            pass
    db.delete(news)
    db.commit()
    return {"status": "ok"}
