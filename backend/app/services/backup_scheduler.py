"""
Автоматическое создание резервных копий по расписанию.
Хранит ZIP-архивы в папке backend/backups/, удаляет старые по правилу keep_count.
"""
import io
import logging
import os
import sqlite3
import zipfile
from datetime import datetime
from pathlib import Path

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AppSetting

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"
BACKUP_DIR.mkdir(exist_ok=True)


def _db_path() -> str:
    return settings.DATABASE_URL.replace("sqlite:///", "").replace("./", "")


def _zipinfo_payload() -> str:
    return (
        f"Monitor backup\n"
        f"date: {datetime.now().isoformat(timespec='seconds')}\n"
        f"app: {settings.APP_NAME} {settings.APP_VERSION}\n"
        f"database: sqlite\n"
    )


def create_backup(include_env: bool = False) -> str:
    """Создаёт ZIP-бэкап и возвращает путь к файлу."""
    db_file = _db_path()
    if not os.path.exists(db_file):
        raise FileNotFoundError(f"Файл БД не найден: {db_file}")

    conn = sqlite3.connect(db_file)
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        conn.close()

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"monitor-backup-{stamp}.zip"
    filepath = BACKUP_DIR / filename

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(db_file, "db/monitoring.db")
        env_file = Path(__file__).resolve().parents[1] / ".env"
        if include_env and env_file.exists():
            zf.write(env_file, "env/.env")
        static_dir = Path(__file__).resolve().parents[1] / "static"
        if static_dir.is_dir():
            for f in static_dir.rglob("*"):
                if f.is_file():
                    zf.write(f, f"static/{f.relative_to(static_dir)}")
        zf.writestr("info/backup-info.txt", _zipinfo_payload())

    filepath.write_bytes(buf.getvalue())
    logger.info("Бэкап создан: %s (%d байт)", filename, filepath.stat().st_size)
    return str(filepath)


def prune_old_backups(keep: int = 5) -> None:
    """Удаляет старые бэкапы, оставляя не более keep."""
    files = sorted(BACKUP_DIR.glob("monitor-backup-*.zip"), key=os.path.getmtime, reverse=True)
    for old in files[keep:]:
        try:
            old.unlink()
            logger.info("Старый бэкап удалён: %s", old.name)
        except OSError as exc:
            logger.warning("Не удалось удалить бэкап %s: %s", old.name, exc)


def get_backup_files() -> list[dict]:
    """Список доступных бэкапов."""
    result = []
    for f in sorted(BACKUP_DIR.glob("monitor-backup-*.zip"), key=os.path.getmtime, reverse=True):
        result.append({
            "name": f.name,
            "size": f.stat().st_size,
            "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec='seconds'),
        })
    return result


def scheduled_backup_job() -> None:
    """Фоновая задача: создать бэкап по расписанию."""
    db = SessionLocal()
    try:
        enabled = AppSetting.get(db, "BACKUP_SCHEDULE_ENABLED", "false").lower() in ("1", "true", "yes", "да")
        include_env = AppSetting.get(db, "BACKUP_INCLUDE_ENV", "false").lower() in ("1", "true", "yes", "да")
        keep = 5
        try:
            keep = int(AppSetting.get(db, "BACKUP_KEEP_COUNT", "5"))
        except (TypeError, ValueError):
            keep = 5
        if not enabled:
            return
        create_backup(include_env=include_env)
        prune_old_backups(keep)
    except Exception:
        logger.exception("Ошибка автоматического бэкапа")
    finally:
        db.close()


def register_backup_job(scheduler) -> None:
    """Регистрирует автоматический бэкап в планировщике (если включено)."""
    db = SessionLocal()
    try:
        enabled = AppSetting.get(db, "BACKUP_SCHEDULE_ENABLED", "false").lower() in ("1", "true", "yes", "да")
        cron = AppSetting.get(db, "BACKUP_SCHEDULE_CRON", "0 2 * * *")
    finally:
        db.close()

    if not enabled:
        logger.info("Автоматические бэкапы отключены")
        return

    try:
        from apscheduler.triggers.cron import CronTrigger
        trigger = CronTrigger.from_crontab(cron)
        scheduler.add_job(
            scheduled_backup_job,
            trigger=trigger,
            id="auto_backup",
            replace_existing=True,
            max_instances=1,
        )
        logger.info("✅ Автобэкап запланирован (cron: %s)", cron)
    except Exception as e:
        logger.error(f"❌ Не удалось запланировать автобэкап: {e}")
