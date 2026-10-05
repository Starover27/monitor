"""
Миграции схемы БД.

ensure_columns() — лёгкая авто-миграция для SQLite: добавляет отсутствующие
колонки в существующие таблицы. Вызывается при старте (main.py) и после
восстановления резервной копии (api/backup.py).

Для PostgreSQL используется ensure_pg_schema() из app/core/database.py.
"""
import logging
import os

from .config import settings

logger = logging.getLogger(__name__)


def sqlite_db_path() -> str:
    """Путь к файлу SQLite (относительно cwd бэкенда)."""
    return settings.DATABASE_URL.replace("sqlite:///", "")


def ensure_columns() -> None:
    """Добавить отсутствующие колонки в SQLite-базу (список из истории проекта)."""
    if "sqlite" not in settings.DATABASE_URL:
        return

    import sqlite3
    db_path = sqlite_db_path()
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        migrations = _build_migrations(cursor)
        for sql in migrations:
            try:
                cursor.execute(sql)
                logger.info(f"✓ Миграция: {sql}")
            except Exception as e:
                logger.warning(f"⚠ Не удалось применить миграцию: {sql} — {e}")
        conn.commit()
    finally:
        conn.close()


def _build_migrations(cursor) -> list:
    """Собрать список ALTER TABLE по текущему состоянию схемы."""
    migrations = []

    def cols(table: str) -> set:
        cursor.execute(f"PRAGMA table_info({table})")
        return {row[1] for row in cursor.fetchall()}

    # services
    s = cols("services")
    for col, ddl in [
        ("last_metric_value", "REAL"),
        ("metric_unit", "VARCHAR(32)"),
        ("group_name", "VARCHAR(128)"),
    ]:
        if col not in s:
            migrations.append(f"ALTER TABLE services ADD COLUMN {col} {ddl}")
    if "sort_order" not in s:
        migrations.append("ALTER TABLE services ADD COLUMN sort_order INTEGER DEFAULT 0")

    # news (картинка новости, WYSIWYG-разметка)
    s = cols("news")
    if s:
        if "image" not in s:
            migrations.append("ALTER TABLE news ADD COLUMN image VARCHAR(256)")
        if "body_html" not in s:
            migrations.append("ALTER TABLE news ADD COLUMN body_html TEXT")

    # portal_sections (описание модуля для карты событий)
    s = cols("portal_sections")
    if s and "description" not in s:
        migrations.append("ALTER TABLE portal_sections ADD COLUMN description VARCHAR(512)")

    # helpdesk_tickets (поле ip_address)
    s = cols("helpdesk_tickets")
    if s and "ip_address" not in s:
        migrations.append("ALTER TABLE helpdesk_tickets ADD COLUMN ip_address VARCHAR(64)")

    # users
    s = cols("users")
    if s:
        if "birth_date" not in s:
            migrations.append("ALTER TABLE users ADD COLUMN birth_date VARCHAR(32)")
        if "ad_groups" not in s:
            migrations.append("ALTER TABLE users ADD COLUMN ad_groups TEXT")

    # status_history
    s = cols("status_history")
    for col, ddl in [
        ("metric_value", "REAL"),
        ("metric_unit", "VARCHAR(32)"),
    ]:
        if col not in s:
            migrations.append(f"ALTER TABLE status_history ADD COLUMN {col} {ddl}")

    # phone_rooms (отдел и ФИО в справочнике)
    s = cols("phone_rooms")
    if s:
        if "department" not in s:
            migrations.append("ALTER TABLE phone_rooms ADD COLUMN department VARCHAR(128)")
        if "full_name" not in s:
            migrations.append("ALTER TABLE phone_rooms ADD COLUMN full_name VARCHAR(256)")

    # portal_tasks (ссылка на внутренний документ, UNC-путь)
    s = cols("portal_tasks")
    if s and "document_url" not in s:
        migrations.append("ALTER TABLE portal_tasks ADD COLUMN document_url VARCHAR(512)")

    return migrations
