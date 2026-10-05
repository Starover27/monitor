# -*- coding: utf-8 -*-
"""
Миграция данных: SQLite (backend/monitoring.db) → PostgreSQL.

Использование:
    1) Поднять PostgreSQL, создать базу:
         createdb -U postgres portal
         psql -U postgres -c "CREATE USER monitor WITH PASSWORD 'monitor_secret';"
         psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE portal TO monitor;"
    2) В backend/.env указать:
         DATABASE_URL=postgresql+psycopg://monitor:monitor_secret@localhost:5432/portal
    3) Запустить (из папки backend):
         ../.venv-win/Scripts/python.exe migrate_to_postgres.py

    Скрипт сам создаст таблицы (create_all) и перенесёт все данные построчно.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SQLITE_URL = "sqlite:///" + os.path.join(os.path.dirname(os.path.abspath(__file__)), "monitoring.db")


def main():
    from sqlalchemy import create_engine, text, MetaData
    from app.core.database import Base, engine as pg_engine
    import app.models  # noqa: F401 — регистрируем все модели

    sqlite_url = os.environ.get("SQLITE_URL", SQLITE_URL)
    print(f"Источник: {sqlite_url}")
    print(f"Приёмник: {pg_engine.url}")

    s_engine = create_engine(sqlite_url)
    s_conn = s_engine.connect()
    pg_conn = pg_engine.connect()

    # 1. создаём схему в Postgres
    print("Создаём таблицы в PostgreSQL...")
    Base.metadata.create_all(bind=pg_engine)

    # 2. читаем таблицы из SQLite
    meta = MetaData()
    meta.reflect(bind=s_engine)
    tables = list(meta.sorted_tables)
    print(f"Таблиц в SQLite: {len(tables)}: {[t.name for t in tables]}")

    total = 0
    for table in tables:
        rows = s_conn.execute(text(f'SELECT * FROM "{table.name}"')).mappings().all()
        if not rows:
            print(f"  - {table.name}: пусто, пропускаем")
            continue
        cols = rows[0].keys()
        placeholders = ", ".join([f":{c}" for c in cols])
        collist = ", ".join([f'"{c}"' for c in cols])
        insert_sql = text(f'INSERT INTO "{table.name}" ({collist}) VALUES ({placeholders})')
        inserted = 0
        for row in rows:
            data = {}
            for c in cols:
                v = row[c]
                # SQLite хранит даты как ISO-строки; Postgres с DATETIME ждёт объект
                if isinstance(v, str) and c.endswith(("_at", "_time")) and "-" in v and ":" in v:
                    try:
                        from datetime import datetime
                        v = datetime.fromisoformat(v.replace("Z", "+00:00"))
                    except ValueError:
                        pass
                data[c] = v
            try:
                pg_conn.execute(insert_sql, data)
                inserted += 1
            except Exception as e:
                # возможен конфликт по unique-ключам — пропускаем
                print(f"    ! строка пропущена ({table.name}): {e}")
        pg_conn.commit()
        total += 1
        print(f"  ✓ {table.name}: перенесено {inserted} строк")
    print(f"Готово. Таблиц обработано: {total}")


if __name__ == "__main__":
    main()
