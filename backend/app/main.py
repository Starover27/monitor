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
from app.models import Service, StatusHistory, Alert, PhoneBookEntry, HelpdeskTicket, TicketEvent, PortalRequest, User, Message, UISetting  # noqa: F401
from app.api.inventory import HostSnapshot  # noqa: F401
from app.api import api_router
from app.api.inventory import router as inventory_router
from app.services.alert_detector import detect_alerts
from app.services.notifier import notifier

logger = logging.getLogger(__name__)

# Планировщик фоновых задач
scheduler = AsyncIOScheduler()


from app.core.migrations import ensure_columns  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создаем таблицы при старте (для SQLite MVP - без Alembic)
    # В продакшене заменить на alembic upgrade head
    Base.metadata.create_all(bind=engine)

    # Лёгкая авто-миграция: добавляем отсутствующие колонки
    ensure_columns()
    # для Postgres — аналогичная миграция (IF NOT EXISTS)
    from app.core.database import ensure_pg_schema
    ensure_pg_schema()

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

    # Автоматические резервные копии по расписанию (если включено в настройках)
    from app.services.backup_scheduler import register_backup_job
    try:
        register_backup_job(scheduler)
    except Exception as e:
        logger.warning(f"⚠ Автобэкап не зарегистрирован: {e}")

    discovery_task = asyncio.create_task(scanner.run())
    seed_default_users()
    seed_sections()
    seed_news()
    # применяем настройки из БД (если ранее сохранялись через админ-панель)
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        apply_settings_to_runtime(db)
    finally:
        db.close()

    # mTLS-прокси по сертификатам (порт 8443)
    from app.core.config import settings as rt
    if getattr(rt, "CERT_PROXY_ENABLED", True):
        import socket as _socket
        host_fqdn = f"{_socket.gethostname().lower()}.{rt.MAIL_DOMAIN}"
        try:
            from app.services.cert_proxy import start_cert_proxy
            await start_cert_proxy(common_name=host_fqdn)
        except Exception as e:
            logger.warning(f"⚠ CertProxy не запущен: {e}")

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

from app.api.auth import router as auth_router  # noqa: E402
app.include_router(auth_router, prefix=settings.API_PREFIX)

from app.api.admin import router as admin_router  # noqa: E402
app.include_router(admin_router, prefix=settings.API_PREFIX)

from app.api.cert import router as cert_router  # noqa: E402
app.include_router(cert_router, prefix=settings.API_PREFIX)

from app.api.settings import router as settings_router, apply_settings_to_runtime  # noqa: E402
app.include_router(settings_router, prefix=settings.API_PREFIX)

from app.api.news import router as news_router  # noqa: E402
app.include_router(news_router, prefix=settings.API_PREFIX)

from app.api.agent import router as agent_router  # noqa: E402
app.include_router(agent_router, prefix=settings.API_PREFIX)

# Статика бэкенда (картинки новостей)
from fastapi.staticfiles import StaticFiles  # noqa: E402
app.mount("/static", StaticFiles(directory="static", check_dir=False), name="static")

# --- Health-check (перед SPA-монтированием, чтобы /health оставался доступным) ---
@app.get("/health", tags=["Health"])
def health():
    """Health-check для балансировщика / мониторинга самого сервера"""
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}

# --- Раздача фронтенда (SPA) ---
# Портал открывается по http://<IP>/ без номера порта. Build фронтенда — в frontend/dist.
import os as _os


class _SpaStaticFiles(StaticFiles):
    """StaticFiles + fallback на index.html для всех SPA-маршрутов (/portal, /inventory, ...)."""

    def lookup_path(self, path: str):
        full_path, stat_result = super().lookup_path(path)
        if stat_result is None:
            index = _os.path.join(self.all_directories[0], "index.html")
            if _os.path.isfile(index):
                return index, _os.stat(index)
        return full_path, stat_result


_FRONTEND_DIST = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))), "frontend", "dist")
if _os.path.isdir(_FRONTEND_DIST):
    app.mount("/", _SpaStaticFiles(directory=_FRONTEND_DIST, html=True, check_dir=False), name="frontend")
    logger.info(f"Frontend is served from port 80 ({_FRONTEND_DIST})")
else:
    logger.warning(f"Folder {_FRONTEND_DIST} not found - build the frontend: cd frontend && npm run build")


def seed_sections():
    """Стартовые разделы портала (меню редактируется в админ-панели)."""
    from app.core.database import SessionLocal
    from app.models import PortalSection
    db = SessionLocal()
    try:
        # (label, icon, path, sort, enabled, admin_only, description)
        defaults = [
            ("Главная", "🏠", "/portal", 0, True, False,
             "Лента новостей клиники, полезная информация и все ваши заявления"),
            ("Отсутствие", "🌴", "/portal/absence", 5, True, False,
             "Заявления на отпуск, больничный, отгул и командировку с датами"),
            ("Документы", "📋", "/portal/documents", 7, True, False,
             "Справки, материальная помощь и кадровые вопросы"),
            ("МИС МедРег", "🩺", "/medreg", 8, True, False,
             "Запуск медицинской информационной системы"),
            ("IT-поддержка", "🛠", "/helpdesk", 10, True, False,
             "Заявка в IT: компьютер, принтер, сеть, доступы — с трекером статуса"),
            ("Телефонный справочник", "📞", "/phones", 20, True, False,
             "Телефоны сотрудников и кабинеты по корпусам с кнопкой звонка"),
            ("Заявки (админ)", "🗂", "/helpdesk/admin", 30, True, True,
             "Все заявки сотрудников: взять в работу, выполнить, комментировать"),
            ("Админ-панель", "⚙️", "/portal/admin", 40, True, True,
             "Пользователи и права, разделы меню, новости, настройки домена и почты"),
            ("Мониторинг ИТ", "📡", "/monitor", 50, True, True,
             "Тёмная панель мониторинга сети: клиенты, инциденты, учёт телефонов"),
        ]
        existing_paths = {s.path: s for s in db.query(PortalSection).all()}
        for label, icon, path, sort, enabled, admin_only, desc in defaults:
            if path in existing_paths:
                # обновляем название/описание существующих разделов (карта событий)
                sec = existing_paths[path]
                if sec.label != label:
                    sec.label = label
                if desc and sec.description != desc:
                    sec.description = desc
                continue
            db.add(PortalSection(label=label, icon=icon, path=path, description=desc,
                                 sort_order=sort, enabled=enabled, admin_only=admin_only))
        db.commit()
    finally:
        db.close()


def seed_news():
    """Новости с сайта клиники kst27.ru (создаются один раз)."""
    from app.core.database import SessionLocal
    from app.models import News
    db = SessionLocal()
    try:
        if not db.query(News).first():
            items = [
                ("Современный стационар нового формата",
                 "В клинике современных технологий действует круглосуточный стационар: одно- и двухместные палаты с современным оборудованием, мобильные функциональные кровати, телевизор и холодильник. Госпитализация — по полису ОМС и на платной основе.", 1),
                ("Нормобарическая терапия: лечение кислородом",
                 "В клинике работают барокамеры для нормобарической гипоксической терапии (НГТ). Курсы помогают восстановиться после COVID-19, при хронической усталости, бронхиальной астме, ИБС, атеросклерозе и вегетососудистых нарушениях. Запись через регистратуру.", 0),
                ("Эндоскопическая диагностика на экспертном уровне",
                 "Эндоскопическое отделение выполняет колоноскопию, ЭГДС и спирометрию на оборудовании высокого разрешения с узкоспектральным излучением. Обследования доступны по ОМС и на платной основе, приём ведут врачи высшей категории.", 0),
                ("Вакцинация против гриппа и пневмококка",
                 "Приглашаем на вакцинацию: грипп, пневмококк, COVID-19. Перед прививкой — обязательный осмотр терапевта. Прививочный кабинет работает по будням; звоните в регистратуру для записи.", 0),
                ("Диспансеризация и профосмотры — по ОМС",
                 "Пройдите ежегодную диспансеризацию или профессиональный осмотр в удобное время. Направление не требуется — запишитесь в регистратуре или через портал. Выполнение всех исследований в одном здании.", 0),
                ("Коллектив профессионалов и новые направления",
                 "В клинике работают врачи высшей и первой категории, кандидаты медицинских наук по 19 направлениям: терапия, хирургия, неврология, кардиология, эндокринология, урология, гинекология, стоматология и другие. Регулярно открываются новые кабинеты и услуги.", 0),
            ]
            for title, body, pinned in items:
                db.add(News(title=title, body=body, author="Администрация клиники", pinned=pinned))
            db.commit()
            logger.info("✅ Новости клиники (kst27.ru) созданы")
    finally:
        db.close()


def seed_default_users():
    """Стартовые учётки портала (для запуска без домена)."""
    from app.core.database import SessionLocal
    from app.models import User
    from app.services.auth_service import hash_password
    db = SessionLocal()
    try:
        defaults = [
            ("admin", "admin123", "admin", "Администратор системы"),
            ("hr", "hr123", "admin", "Кадровая служба"),
            ("ivanov", "ivanov123", "employee", "Иванов Иван Иванович"),
            ("petrova", "petrova123", "employee", "Петрова Анна Сергеевна"),
        ]
        for username, password, role, full_name in defaults:
            if not db.query(User).filter(User.username == username).first():
                db.add(User(
                    username=username,
                    full_name=full_name,
                    email=f"{username}@{settings.MAIL_DOMAIN}",
                    role=role,
                    password_hash=hash_password(password),
                    is_domain=False,
                ))
        db.commit()
        logger.info("✅ Стартовые учётки портала готовы (admin/admin123, hr/hr123, ivanov/ivanov123, petrova/petrova/petrova123)")
    finally:
        db.close()
