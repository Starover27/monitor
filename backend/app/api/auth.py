"""
Auth router — вход по логину/паролю (доменная учётка или локальная БД)
"""
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import User, UserActivity
from app.schemas import LoginRequest, LoginResponse, UserResponse
from app.services.auth_service import (
    ldap_check_credentials, verify_local_password, create_token, verify_token,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Auth"],
)


def _ensure_user(db: Session, username: str, role: str, full_name: Optional[str] = None,
                 email: str = "", department: str = "", is_domain: bool = False) -> User:
    """Создаёт/обновляет пользователя. full_name=None — не менять сохранённое."""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = User(
            username=username,
            full_name=full_name or username,
            email=email or f"{username}@{settings.MAIL_DOMAIN}",
            department=department,
            role=role,
            is_domain=is_domain,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"Создан пользователь портала: {username} (role={role}, domain={is_domain})")
    else:
        # обновляем только полученные из AD данные; пустые значения не затирают сохранённое
        if full_name and user.full_name != full_name:
            user.full_name = full_name
        if email and user.email != email:
            user.email = email
        if department and user.department != department:
            user.department = department
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    """Dependency: текущий пользователь по Bearer-токену."""
    token = authorization.removeprefix("Bearer ").strip()
    username = verify_token(token)
    if not username:
        raise HTTPException(401, "Требуется авторизация")
    user = db.query(User).filter(User.username == username).first()
    if not user or user.disabled:
        raise HTTPException(401, "Пользователь не найден или заблокирован")
    return user


def _track_login(db: Session, user_id: int, username: str) -> None:
    try:
        db.add(UserActivity(user_id=user_id, event_type="login", path="/", meta=json.dumps({"username": username}, ensure_ascii=False)))
        db.commit()
    except Exception:
        pass


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        # Индивидуальные права: раздел «Админ-панель» может быть выдан
        # обычному сотруднику галочкой в «Права» — тогда он получает доступ
        import json as _json
        try:
            visible = _json.loads(user.visible_sections) if user.visible_sections else []
        except (ValueError, TypeError):
            visible = []
        if "/portal/admin" not in visible:
            raise HTTPException(403, "Доступ только для администраторов")
    return user


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(400, "Введите логин и пароль")

    # Доменный формат "DOMAIN\user" (или "user@domain"): убираем префикс домена,
    # чтобы учётка сопоставлялась с одним и тем же пользователем портала
    if "\\" in username:
        username = username.split("\\")[-1].strip()
    elif "@" in username and "." in username.split("@", 1)[1]:
        username = username.split("@", 1)[0]
    if not username:
        raise HTTPException(400, "Введите логин и пароль")

    # 1) Доменная учётная запись (LDAP), если настроена — с жёстким таймаутом,
    #    чтобы неверный адрес домена никогда не подвешивал вход
    ldap_result = None
    if settings.LDAP_SERVER:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=1) as pool:
            try:
                ldap_result = pool.submit(ldap_check_credentials, username, payload.password).result(timeout=8)
            except Exception:
                ldap_result = None  # таймаут/ошибка сети — используем локальную БД
    if ldap_result:
            full_name, email, department, birth_date, groups = ldap_result
            existed = db.query(User).filter(User.username == username).first()
            user = _ensure_user(db, username, role="employee",
                                full_name=full_name, email=email,
                                department=department, is_domain=True)
            if birth_date:
                user.birth_date = birth_date
            # группы из AD — сохраняем при каждом входе (используются в фильтре админки)
            if groups:
                user.ad_groups = json.dumps(groups, ensure_ascii=False)
            # роль: группа из AD (LDAP_ADMIN_GROUPS) ИЛИ ранее назначенная админом вручную
            admin_groups = [g.strip().lower() for g in (settings.LDAP_ADMIN_GROUPS or "").split(",") if g.strip()]
            in_admin_group = any(g.lower() in admin_groups for g in groups)
            if in_admin_group and user.role != "admin":
                user.role = "admin"
            elif existed and existed.role == "admin" and not in_admin_group:
                pass  # вручную назначенного админа AD-группой не сбрасываем
            db.commit()
            db.refresh(user)
            token = create_token(user.username)
            _track_login(db, user.id, user.username)
            return LoginResponse(token=token, user=UserResponse.model_validate(user))

    # 2) Локальная учётка в БД
    user = db.query(User).filter(User.username == username).first()
    if user and user.password_hash and verify_local_password(payload.password, user.password_hash):
        token = create_token(user.username)
        _track_login(db, user.id, user.username)
        return LoginResponse(token=token, user=UserResponse.model_validate(user))

    raise HTTPException(401, "Неверный логин или пароль")


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)


@router.post("/logout")
def logout():
    # Токены без состояния на сервере — выход происходит на клиенте
    return {"status": "ok"}


@router.get("/sso")
def sso(authorization: str = Header(default=""), db: Session = Depends(get_db)):
    """
    Автовход через Windows-домен (SSPI/Negotiate).
    Браузер сам подставляет доменный токен — пользователю ничего вводить не нужно.
    Работает, когда портал в зоне «Местная интрасеть» браузера.
    """
    from app.core.config import settings
    from app.services.auth_service import sso_accept_token

    if not getattr(settings, "SSO_ENABLED", False):
        raise HTTPException(501, "SSO не включён. Включите его в админ-панели (Настройки → Автовход Windows).")

    result, payload = sso_accept_token(authorization)

    if result == "challenge":
        headers = {"WWW-Authenticate": payload or "Negotiate"}
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Negotiate", headers=headers)

    if result != "ok":
        raise HTTPException(401, payload or "SSO не выполнен")

    # payload = "DOMAIN\\username"
    username = payload.split("\\")[-1].strip()
    if not username:
        raise HTTPException(401, "Не удалось определить доменного пользователя")

    # подтягиваем ФИО/отдел/должность из AD через сервисную учётку (если настроена)
    full_name = None
    department = ""
    position = ""
    from app.core.config import settings
    try:
        import ldap3
        if settings.LDAP_SERVER and settings.LDAP_BASE_DN:
            host = settings.LDAP_SERVER.replace("ldap://", "").replace("ldaps://", "").split(":")[0]
            srv = ldap3.Server(host, get_info=ldap3.NONE, connect_timeout=3)
            bind_user = settings.LDAP_BIND_USER or None
            conn = ldap3.Connection(srv, user=bind_user, password=settings.LDAP_BIND_PASSWORD or None,
                                    auto_bind=bool(bind_user))
            if conn.search(settings.LDAP_BASE_DN, f"(sAMAccountName={username})",
                           attributes=["displayName", "department", "title"]):
                e = conn.entries[0]
                if e.displayName:
                    full_name = str(e.displayName)
                department = str(e.department) if e.department else ""
                position = str(e.title) if e.title else ""
            conn.unbind()
    except Exception as e:
        logger.info(f"SSO: AD-lookup для {username} не удался: {e}")

    user = _ensure_user(db, username, role="employee", full_name=full_name,
                        department=department, is_domain=True)
    if position:
        user.position = position
    if department:
        user.department = department

    # bootstrap: если активных админов нет — первый доменный пользователь становится админом
    has_admin = db.query(User).filter(User.role == "admin", User.disabled == False).first()  # noqa: E712
    if not has_admin:
        user.role = "admin"
    db.commit()
    db.refresh(user)

    token = create_token(user.username)
    _track_login(db, user.id, user.username)
    return LoginResponse(token=token, user=UserResponse.model_validate(user))
