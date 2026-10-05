"""
Подключение к базе данных и сессии.

Поддерживаются:
  • SQLite (по умолчанию):  DATABASE_URL=sqlite:///./monitoring.db
  • PostgreSQL:             DATABASE_URL=postgresql+psycopg://monitor:пароль@localhost:5432/portal
(установить: pip install psycopg[binary])
"""
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

_database_url = settings.DATABASE_URL

# Создаем движок БД
# connect_args для SQLite (проверка существования в том же потоке)
engine = create_engine(
    _database_url,
    connect_args={"check_same_thread": False} if "sqlite" in _database_url else {
        "connect_timeout": 10,
    },
    echo=settings.DEBUG,
    pool_pre_ping=True,   # переживаем разрывы соединения (для Postgres)
)

# Фабрика сессий
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Базовый класс для моделей
Base = declarative_base()


def get_db():
    """Dependency для получения DB сессии в эндпоинтах"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_pg_schema():
    """Мягкая миграция для PostgreSQL: добавляем отсутствующие колонки, если ещё нет.
    В production лучше Alembic, но чтобы работало "из коробки" — идём тем же списком,
    что и ensure_columns() для SQLite, но синтаксисом Postgres (IF NOT EXISTS).
    """
    if not _database_url.startswith("postgresql"):
        return

    import logging
    logger = logging.getLogger(__name__)
    stmts = [
        # services
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS last_metric_value DOUBLE PRECISION",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS metric_unit VARCHAR(32)",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS group_name VARCHAR(128)",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
        # news
        "ALTER TABLE news ADD COLUMN IF NOT EXISTS image VARCHAR(256)",
        "ALTER TABLE news ADD COLUMN IF NOT EXISTS body_html TEXT",
        # portal_sections
        "ALTER TABLE portal_sections ADD COLUMN IF NOT EXISTS description VARCHAR(512)",
        # helpdesk_tickets
        "ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64)",
        # users
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date VARCHAR(32)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS ad_groups TEXT",
        # status_history
        "ALTER TABLE status_history ADD COLUMN IF NOT EXISTS metric_value DOUBLE PRECISION",
        "ALTER TABLE status_history ADD COLUMN IF NOT EXISTS metric_unit VARCHAR(32)",
        # phone_rooms
        "ALTER TABLE phone_rooms ADD COLUMN IF NOT EXISTS department VARCHAR(128)",
        "ALTER TABLE phone_rooms ADD COLUMN IF NOT EXISTS full_name VARCHAR(256)",
    ]
    with engine.connect() as conn:
        for s in stmts:
            try:
                conn.execute(text(s))
            except Exception as e:
                logger.warning(f"⚠ Postgres миграция не удалась: {s} — {e}")
        conn.commit()
