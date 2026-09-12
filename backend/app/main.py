"""
Точка входа FastAPI приложения
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import asyncio
from app.api.discovery import router as discovery_router
from app.services.discovery import scanner

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import settings
from app.core.database import engine, Base
# Импортируем модели, чтобы они зарегистрировались в Base.metadata
from app.models import Service, StatusHistory, Alert  # noqa: F401
from app.api.inventory import HostSnapshot  # noqa: F401
from app.api import api_router
from app.api.inventory import router as inventory_router
from app.services.alert_detector import detect_alerts
from app.services.notifier import notifier

logger = logging.getLogger(__name__)

# Планировщик фоновых задач
scheduler = AsyncIOScheduler()


def ensure_columns():
    """
    Лёгкая авто-миграция для SQLite: добавляет отсутствующие колонки.
    Работает только с SQLite (для Postgres/MySQL использовать Alembic).
    """
    if "sqlite" not in settings.DATABASE_URL:
        return
    
    import sqlite3
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Получаем список колонок services
    cursor.execute("PRAGMA table_info(services)")
    existing_cols = {row[1] for row in cursor.fetchall()}
    
    migrations = []
    if "last_metric_value" not in existing_cols:
        migrations.append("ALTER TABLE services ADD COLUMN last_metric_value REAL")
    if "metric_unit" not in existing_cols:
        migrations.append("ALTER TABLE services ADD COLUMN metric_unit VARCHAR(32)")
    if "group_name" not in existing_cols:
        migrations.append("ALTER TABLE services ADD COLUMN group_name VARCHAR(128)")
    if "sort_order" not in existing_cols:
        migrations.append("ALTER TABLE services ADD COLUMN sort_order INTEGER DEFAULT 0")
    
    # Получаем список колонок status_history
    cursor.execute("PRAGMA table_info(status_history)")
    existing_cols_hist = {row[1] for row in cursor.fetchall()}
    
    if "metric_value" not in existing_cols_hist:
        migrations.append("ALTER TABLE status_history ADD COLUMN metric_value REAL")
    if "metric_unit" not in existing_cols_hist:
        migrations.append("ALTER TABLE status_history ADD COLUMN metric_unit VARCHAR(32)")
    
    for sql in migrations:
        try:
            cursor.execute(sql)
            logger.info(f"✅ Миграция: {sql}")
        except Exception as e:
            logger.warning(f"⚠ Не удалось применить миграцию: {sql} — {e}")
    
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создаем таблицы при старте (для SQLite MVP - без Alembic)
    # В продакшене заменить на alembic upgrade head
    Base.metadata.create_all(bind=engine)
    
    # Лёгкая авто-миграция: добавляем отсутствующие колонки
    ensure_columns()

    # Запускаем фоновую задачу детектора алертов
    scheduler.add_job(
        detect_alerts,
        "interval",
        seconds=settings.ALERT_CHECK_INTERVAL_SECONDS,
        id="alert_detector",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        f"✅ Планировщик запущен. Детектор алертов каждые "
        f"{settings.ALERT_CHECK_INTERVAL_SECONDS}s (порог: "
        f"{settings.ALERT_CONSECUTIVE_FAILURES} fail подряд, канал: "
        f"{settings.NOTIFICATION_CHANNEL})"
    )

    discovery_task = asyncio.create_task(scanner.run())
    try:
        yield
    finally:
        discovery_task.cancel()
        await asyncio.gather(discovery_task, return_exceptions=True)

    # Останавливаем планировщик и закрываем HTTP-клиент уведомлений
    scheduler.shutdown(wait=False)
    await notifier.close()
    logger.info("🛑 Планировщик остановлен")



app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Система мониторинга сервисов и хостов - Backend API",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем все API роутеры под префиксом /api
# В итоге эндпоинты будут: POST /api/heartbeat, GET /api/services, GET /api/history/{id}
app.include_router(api_router, prefix=settings.API_PREFIX)
app.include_router(inventory_router, prefix=settings.API_PREFIX)
app.include_router(discovery_router, prefix=settings.API_PREFIX)


@app.get("/", tags=["Health"])
def health_check():
    """Health-check для балансировщика / мониторинга самого сервера"""
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
