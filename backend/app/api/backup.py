"""
Backup — резервные копии портала (админ-панель → Настройки).

GET  /api/backup/download — скачать ZIP: БД (monitoring.db), .env, загруженные файлы (static/).
POST /api/backup/restore  — восстановить из ZIP (формат нашего бэкапа):
     1) current БД откатывается в мониторинг.db.pre-restore-<ts> (хранится последние 3)
     2) новая БД размещается на место текущей, static/ сливается, .env — только по флагу
     3) схема дозаполняется (create_all + ensure_columns), соединение БД обновляется

Поддерживается только SQLite (для PostgreSQL нужен pg_dump — пока не поддерживается).
"""
import io
import logging
import os
import re
import shutil
import sqlite3
import tempfile
import time
import zipfile
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import text

from app.api.auth import require_admin
from app.core.config import settings
from app.core.database import Base, engine
from app.core.migrations import ensure_columns, sqlite_db_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backup", tags=["Backup"])

# backend/ — корень приложения (тут же лежит monitoring.db при sqlite:///)
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_DIR = os.path.join(BACKEND_DIR, "static")
ENV_FILE = os.path.join(BACKEND_DIR, ".env")
MAX_PRE_RESTORE = 3


def _db_path() -> str:
    return os.path.abspath(sqlite_db_path())


def _require_sqlite():
    if "sqlite" not in settings.DATABASE_URL:
        raise HTTPException(501, "Резервные копии поддерживаются только для SQLite. Для PostgreSQL используйте pg_dump.")


def _zipinfo_payload() -> str:
    return (
        f"Monitor backup\n"
        f"date: {datetime.now().isoformat(timespec='seconds')}\n"
        f"app: {settings.APP_NAME} {settings.APP_VERSION}\n"
        f"database: sqlite\n"
        f"contents: db/monitoring.db, env/.env (если есть), static/** (загрушенные файлы), info/backup-info.txt\n"
        f"restore: Админ-панель → Настройки → «Восстановить из резервной копии»\n"
    )


@router.get("/download", dependencies=[Depends(require_admin)])
def download_backup(admin=Depends(require_admin)):
    """Собрать и отправить ZIP с БД, .env и загруженными файлами."""
    _require_sqlite()
    db_file = _db_path()
    if not os.path.exists(db_file):
        raise HTTPException(404, "Файл БД не найден")

    # фиксируем данные в основном файле (WAL → monitoring.db)
    conn = sqlite3.connect(db_file)
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        conn.close()

    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(db_file, "db/monitoring.db")
        if os.path.exists(ENV_FILE):
            zf.write(ENV_FILE, "env/.env")
        if os.path.isdir(STATIC_DIR):
            for root, _dirs, files in os.walk(STATIC_DIR):
                for name in files:
                    full = os.path.join(root, name)
                    rel = os.path.relpath(full, STATIC_DIR).replace(os.sep, "/")
                    zf.write(full, f"static/{rel}")
        zf.writestr("info/backup-info.txt", _zipinfo_payload())

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="monitor-backup-{stamp}.zip"'},
    )


def _find_member(zf: zipfile.ZipFile, pattern: str):
    """Первый файл архива по регулярному выражению (без zip-slip)."""
    for name in zf.namelist():
        if ".." in name.split("/") or os.path.isabs(name):
            continue
        if re.fullmatch(pattern, name):
            return name
    return None


def _sqlite_copy(src_path: str, dst_path: str, busy_ms: int = 5000) -> None:
    """Онлайн-копия содержимого src → dst (SQLite online-backup API).

    Работает даже когда dst открыт другими соединениями — без перемещения
    файла (перемещение заблокированных файлов под Windows падает WinError 32).
    busy_timeout: сколько ждать захват блокировки dst (защита от «тихого»
    no-op, когда БД занята другой записью в момент копирования).
    """
    src = sqlite3.connect(src_path)
    try:
        dst = sqlite3.connect(dst_path)
        try:
            dst.execute(f"PRAGMA busy_timeout={busy_ms}")
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _checkpoint(path: str) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        conn.close()


def _row_count(path: str, table: str):
    """Кол-во строк в таблице (None, если прочитать не удалось)."""
    try:
        conn = sqlite3.connect(path)
        try:
            conn.execute("PRAGMA busy_timeout=3000")
            return conn.execute(f"SELECT count(*) FROM [{table}]").fetchone()[0]
        finally:
            conn.close()
    except Exception:
        return None


def _copy_verified(src_path: str, dst_path: str, tables=("portal_tasks", "users"), attempts: int = 4) -> bool:
    """Копия src → dst с проверкой: после копирования считаем строки в dst.

    Если данные не сошлись (конкурентная запись / блокировка) — повторяем.
    Возвращает True, только если dst действительно стал содержимым src.
    """
    for _ in range(attempts):
        _sqlite_copy(src_path, dst_path)
        ok = True
        for t in tables:
            if _row_count(src_path, t) != _row_count(dst_path, t):
                ok = False
                break
        if ok:
            return True
        time.sleep(0.5)
    return False


def _pause_scheduler() -> bool:
    """Ставим фоновый алерт-детектор на паузу, чтобы не было конкурентных записей."""
    try:
        from app.main import scheduler
        if scheduler.running:
            scheduler.pause()
            return True
    except Exception as e:
        logger.warning(f"Не удалось поставить планировщик на паузу: {e}")
    return False


def _resume_scheduler(paused: bool) -> None:
    if not paused:
        return
    try:
        from app.main import scheduler
        if not scheduler.running:
            scheduler.resume()
    except Exception as e:
        logger.warning(f"Не удалось вернуть планировщик в работу: {e}")


@router.post("/restore", dependencies=[Depends(require_admin)])
async def restore_backup(
    admin=Depends(require_admin),
    file: UploadFile = File(...),
    include_env: bool = Form(False),
):
    """Восстановить портal из ZIP-бэкапа. Текущая БД сохраняется как .pre-restore."""
    _require_sqlite()
    data = await file.read()
    if len(data) < 64:
        raise HTTPException(400, "Файл слишком мал, чтобы быть резервной копией")

    tmp_dir = tempfile.mkdtemp(prefix="restore-")
    paused = False
    try:
        tmp_zip = os.path.join(tmp_dir, "backup.zip")
        with open(tmp_zip, "wb") as f:
            f.write(data)

        if not zipfile.is_zipfile(tmp_zip):
            raise HTTPException(400, "Не ZIP-архив")
        with zipfile.ZipFile(tmp_zip) as zf:
            bad = [n for n in zf.namelist() if ".." in n.split("/") or os.path.isabs(n)]
            if bad:
                raise HTTPException(400, "Некорректная структура архива")
            db_member = _find_member(zf, r"db/[^/]+\.db")
            if not db_member:
                raise HTTPException(400, "В архиве не найдена БД (db/*.db). Это не наш бэкап?")
            with zf.open(db_member) as src, open(os.path.join(tmp_dir, "new.db"), "wb") as dst:
                head = src.read(16)
                dst.write(head)
                dst.write(src.read())
        new_db = open(os.path.join(tmp_dir, "new.db"), "rb").read(16)
        if new_db != b"SQLite format 3\x00":
            raise HTTPException(400, "БД в архиве повреждена или не SQLite")

        db_file = _db_path()
        pre_stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        pre = f"{db_file}.pre-restore-{pre_stamp}"

        # Блокируем фоновые записи (алерт-детектор) и освобождаем пул БД
        paused = _pause_scheduler()
        engine.dispose()

        # 1) снапшот текущей БД (онлайн-копия, последние MAX_PRE_RESTORE)
        if os.path.exists(db_file):
            _sqlite_copy(db_file, pre)
            old_pre = sorted(
                (f for f in os.listdir(BACKEND_DIR) if f.startswith(os.path.basename(db_file) + ".pre-restore-")),
                reverse=True,
            )
            for f in old_pre[MAX_PRE_RESTORE - 1:]:
                os.remove(os.path.join(BACKEND_DIR, f))
        else:
            pre = None

        # 2) вливаем содержимое новой БД в живую (онлайн-бэкап API с проверкой и повтором)
        if not _copy_verified(os.path.join(tmp_dir, "new.db"), db_file):
            raise HTTPException(500, "Не удалось применить резервную копию: данные не изменились. БД могла быть занята другими процессами.")
        _checkpoint(db_file)

        # 3) загруженные файлы (static/) — слияние поверх текущих
        with zipfile.ZipFile(tmp_zip) as zf:
            for name in zf.namelist():
                if name.startswith("static/") and not name.endswith("/"):
                    rel = name[len("static/"):].replace("/", os.sep)
                    target = os.path.join(STATIC_DIR, rel)
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with zf.open(name) as src, open(target, "wb") as dst:
                        dst.write(src.read())

        # 4) .env — только по явному флагу (сбрасывает SECRET_KEY: агенты и сессии!)
        env_restored = False
        if include_env:
            with zipfile.ZipFile(tmp_zip) as zf:
                env_member = _find_member(zf, r"env/\.env")
                if env_member:
                    if os.path.exists(ENV_FILE):
                        os.replace(ENV_FILE, f"{ENV_FILE}.bak-{pre_stamp}")
                    with zipfile.ZipFile(tmp_zip) as zf2, zf2.open(env_member) as src, open(ENV_FILE, "wb") as dst:
                        dst.write(src.read())
                    env_restored = True

        # 5) дозаполняем схему (старые бэкапы могут не иметь новых таблиц/колонок)
        Base.metadata.create_all(bind=engine)
        ensure_columns()

        # 6) сбрасываем пул, чтобы приложение читало свежие данные
        engine.dispose()

        pre_name = os.path.basename(pre) if pre else None
        logger.info(f"✓ Бэкап восстановлен (включая .env: {env_restored}); резервная копия: {pre_name or 'нет (БД была пустой)'}")
        return {
            "status": "ok",
            "env_restored": env_restored,
            "pre_restore_copy": pre_name,
            "warning": "Перезагрузите страницу (F5). Если восстановлен .env — токен агентов и все сессии сброшены: войдите заново и обновите токен в агентах."
            if env_restored else "Перезагрузите страницу (F5), чтобы данные обновились.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка восстановления бэкапа")
        raise HTTPException(500, f"Не удалось восстановить бэкап: {e}")
    finally:
        _resume_scheduler(paused)
        shutil.rmtree(tmp_dir, ignore_errors=True)
