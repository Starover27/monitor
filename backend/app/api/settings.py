"""
Settings router — настройки портала для админ-панели:
  - Домен AD (сервер, домен, BaseDN, группы админов, атрибут даты рождения)
  - Почта (SMTP, отправитель, получатель уведомлений)
  - Проверка подключения к домену прямо из панели
Настройки хранятся в БД и имеют приоритет над .env; применяются без рестарта.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
import re

from app.api.deps import get_db
from app.api.auth import require_admin
from app.models import AppSetting

router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
)

# ключи, доступные для чтения/записи
KEYS = [
    "LDAP_SERVER", "LDAP_DOMAIN", "LDAP_BASE_DN",
    "LDAP_ADMIN_GROUPS", "LDAP_BIRTH_ATTRIBUTE", "MAIL_DOMAIN",
    "LDAP_BIND_USER", "LDAP_BIND_PASSWORD",
    "SMTP_HOST", "SMTP_PORT", "SMTP_SSL",
    "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM", "NOTIFY_EMAIL_TO",
    "SSO_ENABLED",
]
SECRET_KEYS = {"SMTP_PASSWORD", "LDAP_BIND_PASSWORD"}
BOOL_KEYS = {"SMTP_SSL", "SSO_ENABLED"}
INT_KEYS = {"SMTP_PORT"}


def get_effective(db: Session, key: str) -> str:
    """Значение из БД, иначе из settings (env)."""
    from app.core.config import settings
    db_val = AppSetting.get(db, key, "")
    if db_val != "":
        return db_val
    return str(getattr(settings, key, "") or "")


def apply_settings_to_runtime(db: Session):
    """Применяем сохранённые настройки к рантайму без рестарта."""
    from app.core.config import settings
    for key in KEYS:
        db_val = AppSetting.get(db, key, "")
        if db_val != "":
            if key in BOOL_KEYS:
                setattr(settings, key, db_val.lower() in ("1", "true", "yes", "да"))
            elif key in INT_KEYS:
                try:
                    setattr(settings, key, int(db_val))
                except ValueError:
                    pass
            else:
                setattr(settings, key, db_val)


class SettingsResponse(BaseModel):
    LDAP_SERVER: str = ""
    LDAP_DOMAIN: str = ""
    LDAP_BASE_DN: str = ""
    LDAP_ADMIN_GROUPS: str = ""
    LDAP_BIRTH_ATTRIBUTE: str = ""
    MAIL_DOMAIN: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: str = ""
    SMTP_SSL: bool = False
    SMTP_USER: str = ""
    SMTP_PASSWORD_SET: bool = False
    MAIL_FROM: str = ""
    NOTIFY_EMAIL_TO: str = ""
    LDAP_BIND_USER: str = ""
    LDAP_BIND_PASSWORD_SET: bool = False
    SSO_ENABLED: bool = False


class SettingsUpdate(BaseModel):
    LDAP_SERVER: Optional[str] = None
    LDAP_DOMAIN: Optional[str] = None
    LDAP_BASE_DN: Optional[str] = None
    LDAP_ADMIN_GROUPS: Optional[str] = None
    LDAP_BIRTH_ATTRIBUTE: Optional[str] = None
    MAIL_DOMAIN: Optional[str] = None
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: Optional[str] = None
    SMTP_SSL: Optional[bool] = None
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None  # пусто = не менять
    LDAP_BIND_USER: Optional[str] = None
    LDAP_BIND_PASSWORD: Optional[str] = None  # пусто = не менять
    MAIL_FROM: Optional[str] = None
    NOTIFY_EMAIL_TO: Optional[str] = None
    SSO_ENABLED: Optional[bool] = None


class TestRequest(BaseModel):
    username: str
    password: str


class DiscoverRequest(BaseModel):
    server: str          # адрес домена или контроллера: kst.local, dc01.kst.local, ldap://dc01:389
    admin_login: str     # admin@kst.local | KST\admin | admin
    admin_password: str


def _discover_candidates(server_raw: str, admin_login: str):
    """Список кандидатов (host, port, use_ssl) для подключения к КД."""
    import re as _re
    import socket

    server_raw = server_raw.strip()
    explicit_ssl = server_raw.lower().startswith("ldaps")
    m_port = _re.search(r":(\d+)$", server_raw)
    explicit_port = int(m_port.group(1)) if m_port else None

    host = _re.sub(r"^(ldaps?|ldap)://", "", server_raw, flags=_re.IGNORECASE).strip("/")
    host = host.split(":")[0]
    if not host:
        raise HTTPException(400, "Некорректный адрес")

    candidates = []

    def add(h, port, ssl):
        if h and (h, port, ssl) not in candidates:
            candidates.append((h, port, ssl))

    # 1) если пользователь ввёл имя домена, а не КД — ищем контроллер через DNS SRV
    if "." in host and not host.split(".")[0].startswith(("dc", "ad", "ldap")) or host.count(".") >= 1:
        # Пробуем все известные DNS-серверы машины (может быть как публичный, так и локальный)
        import subprocess
        dns_servers = []
        ipconfig_path = r"C:\Windows\System32\ipconfig.exe"
        try:
            out = subprocess.run([ipconfig_path, "/all"], capture_output=True, text=True, timeout=10,
                                 encoding="cp866", errors="replace").stdout
            import re as _re2
            dns_servers = _re2.findall(r"192\.168\.\d+\.\d+", out)[:4]
        except Exception:
            pass
        if not dns_servers:
            dns_servers = [""]

        # DNS-серверы в локальной сети часто и есть контроллеры домена — проверяем их
        for d in list(dns_servers):
            if d:
                add(d, 389, False)
                add(d, 636, True)

        for dns in dns_servers:
            for zone in (f"_ldap._tcp.{host}", f"_ldap._tcp.dc._msdcs.{host}"):
                try:
                    args = ["nslookup", "-type=SRV", zone] + ([dns] if dns else [])
                    out = subprocess.run(args, capture_output=True, text=True, timeout=6).stdout
                    for m in _re.finditer(r"svr hostname\s*=\s*(.+?)\s*$", out, _re.MULTILINE):
                        found = m.group(1).strip().rstrip(".")
                        if found:
                            add(found, 636, True)
                            add(found, 389, False)
                except Exception:
                    pass

    # 2) варианты имени: как ввели + типовые префиксы контроллеров
    base_names = [host]
    if "." in host:
        dom = host
        base_names += [f"dc.{dom}", f"dc01.{dom}", f"dc1.{dom}", f"ad.{dom}", f"srv.{dom}", f"server.{dom}"]
        # и сам хост без первой метки тоже может быть КД
        base_names.append(host.split(".")[0])
    else:
        base_names += [f"dc.{host}.local", f"dc01.{host}.local", f"ad.{host}.local"]

    for name in base_names:
        try:
            socket.gethostbyname(name)
            for port in ([explicit_port] if explicit_port else ([636] if explicit_ssl else [389, 636])):
                add(name, port, port == 636)
        except OSError:
            continue

    return candidates


def _try_bind(candidate, admin_login: str, password: str, dns_hint: str):
    """Пытаемся привязаться; возвращает (conn, server, bind_user, dns_domain) или ошибку."""
    import ldap3
    host, port, use_ssl = candidate

    # варианты формы логина
    acct = admin_login.split("\\")[-1].split("@")[0]
    parts = []
    if "\\" in admin_login:
        parts.append(admin_login)
        if dns_hint:
            parts.append(f"{acct}@{dns_hint}")
    elif "@" in admin_login:
        parts.append(admin_login)
    else:
        if dns_hint:
            parts.append(f"{admin_login}@{dns_hint}")
        parts.append(admin_login)

    last_err = None
    for user in parts:
        try:
            srv = ldap3.Server(host, port=port, use_ssl=use_ssl, get_info=ldap3.ALL, connect_timeout=5)
            conn = ldap3.Connection(srv, user=user, password=password, auto_bind=True)
            dns_domain = ".".join(host.split(".")[1:]) if "." in host else dns_hint
            return conn, srv, user, dns_domain, None
        except Exception as e:
            last_err = str(e)
    return None, None, None, None, last_err


@router.post("/discover")
def discover_domain(payload: DiscoverRequest, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """
    Автонастройка домена: принимаем адрес домена (kst.local) или конкретного контроллера,
    сами находим контроллер (DNS SRV + типовые имена), перебираем порты и формы логина,
    определяем базовый DN, NetBIOS-имя, группы админов и включаем доменную авторизацию.
    """
    import ldap3

    server_raw = payload.server.strip()
    if not server_raw:
        raise HTTPException(400, "Укажите адрес домена")

    candidates = _discover_candidates(server_raw, payload.admin_login)
    if not candidates:
        raise HTTPException(400, f"Не удалось найти контроллер домена по адресу «{server_raw}». Проверьте, что сервер виден в сети (пинг, DNS), или укажите имя конкретного контроллера (например dc01.kst.local).")

    conn = srv = dns_domain = bind_user = None
    last_err = ""
    for cand in candidates:
        dns_hint = ".".join(cand[0].split(".")[1:]) if "." in cand[0] else ""
        conn, srv, bind_user, dns_domain, err = _try_bind(cand, payload.admin_login, payload.admin_password, dns_hint)
        if conn:
            break
        last_err = err or ""
    if not conn:
        raise HTTPException(400, f"Не удалось подключиться к домену. Проверьте логин/пароль администратора. Причина: {last_err[:300]}")

    try:
        info = srv.info
        # базовый DN из RootDSE
        base_dn = ""
        if info and info.other:
            base_dn = info.other.get("defaultNamingContext", [""])[0]
        if not base_dn:
            raise HTTPException(400, "Контроллер отвечает, но не вернул RootDSE — это не Active Directory?")

        # NetBIOS-имя домена: первый компонент base DN или из DNS-домена
        first_dc = next((p.replace("DC=", "") for p in base_dn.split(",") if p.strip().startswith("DC=")), "")
        netbios = (first_dc or (dns_domain.split(".")[0] if dns_domain else "")).upper()

        # имя учётки для поиска атрибутов
        acct = payload.admin_login.split("\\")[-1].split("@")[0]
        display, email, groups = admin_login, "", []
        if conn.search(base_dn, f"(sAMAccountName={acct})", attributes=["displayName", "mail", "memberOf"]):
            e = conn.entries[0]
            display = str(e.displayName) if e.displayName else acct
            email = str(e.mail) if e.mail else f"{acct}@{dns_domain or netbios.lower()+'.'+dns_domain}"
            groups = [str(g).split(",")[0].replace("CN=", "") for g in (e.memberOf or [])]

        # группы с правами админа: Domain Admins + группы, где состоит администратор
        admin_groups = []
        if conn.search(base_dn, "(&(objectCategory=group)(cn=Domain Admins))", attributes=["cn"]):
            admin_groups.append("Domain Admins")
        for g in groups:
            if g not in admin_groups and "admin" in g.lower():
                admin_groups.append(g)

        # сохраняем и применяем без рестарта
        used_host = srv.host
        used_port = srv.port
        AppSetting.set(db, "LDAP_SERVER", f"ldap://{used_host}:{used_port}")
        AppSetting.set(db, "LDAP_DOMAIN", netbios)
        AppSetting.set(db, "LDAP_BASE_DN", base_dn)
        AppSetting.set(db, "LDAP_ADMIN_GROUPS", ", ".join(admin_groups))
        # сервисная учётка для поиска ФИО/отдела (например для SSO-автовхода)
        AppSetting.set(db, "LDAP_BIND_USER", bind_user)
        AppSetting.set(db, "LDAP_BIND_PASSWORD", payload.admin_password)
        if dns_domain:
            AppSetting.set(db, "MAIL_DOMAIN", dns_domain)
        db.commit()
        apply_settings_to_runtime(db)

        return {
            "ok": True,
            "server": f"ldap://{used_host}:{used_port}",
            "base_dn": base_dn,
            "netbios": netbios,
            "dns_domain": dns_domain,
            "admin_groups": admin_groups,
            "admin_check": {"full_name": display, "email": email, "groups": groups},
            "message": "Домен подключен: авторизация по доменному логину и паролю включена.",
        }
    finally:
        try:
            conn.unbind()
        except Exception:
            pass


@router.get("", response_model=SettingsResponse)
def read_settings(admin=Depends(require_admin), db: Session = Depends(get_db)):
    out = {}
    for key in KEYS:
        val = get_effective(db, key)
        if key in BOOL_KEYS:
            out[key] = val.lower() in ("1", "true", "yes", "да")
        elif key in ("SMTP_PASSWORD", "LDAP_BIND_PASSWORD"):
            out["SMTP_PASSWORD_SET" if key == "SMTP_PASSWORD" else "LDAP_BIND_PASSWORD_SET"] = bool(val)
        else:
            out[key] = val
    return out


@router.put("")
def update_settings(payload: SettingsUpdate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if key in ("SMTP_PASSWORD", "LDAP_BIND_PASSWORD"):
            if value:  # пусто = не менять
                AppSetting.set(db, key, value)
            continue
        if value is None:
            continue
        AppSetting.set(db, key, str(value))
    db.commit()
    apply_settings_to_runtime(db)
    return {"status": "ok", "applied": True}


@router.post("/test-ldap")
def test_ldap(payload: TestRequest, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Проверка входа доменной учёткой с текущими настройками."""
    from app.core.config import settings as rt
    from app.services.auth_service import ldap_check_credentials

    if not rt.LDAP_SERVER:
        raise HTTPException(400, "LDAP-сервер не задан. Укажите адрес контроллера домена и сохраните настройки.")

    info = ldap_check_credentials(payload.username.strip(), payload.password)
    if not info:
        raise HTTPException(401, "Не удалось подключиться: неверный логин/пароль или недоступен контроллер домена")

    full_name, email, department, birth_date, groups = info
    admin_groups = [g.strip().lower() for g in (rt.LDAP_ADMIN_GROUPS or "").split(",") if g.strip()]
    return {
        "ok": True,
        "full_name": full_name,
        "email": email,
        "department": department,
        "birth_date": birth_date,
        "groups": groups,
        "is_admin": any(g.lower() in admin_groups for g in groups),
    }


@router.post("/ad-users")
def list_ad_users(payload: dict = None, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """
    Список пользователей домена (для синхронизации в портале).
    Креды для поиска: переданные (bind_user/bind_password) или сохранённые LDAP_BIND_*.
    """
    import ldap3
    from app.core.config import settings as rt

    if not rt.LDAP_SERVER or not rt.LDAP_BASE_DN:
        raise HTTPException(400, "Домен не подключен. Сначала выполните «Быстрое подключение домена».")

    payload = payload or {}
    user_for_bind = (payload.get("bind_user") or rt.LDAP_BIND_USER or "").strip()
    pass_for_bind = payload.get("bind_password") or rt.LDAP_BIND_PASSWORD or ""
    if user_for_bind and not pass_for_bind:
        user_for_bind = ""

    # Парсим LDAP_SERVER: [ldaps://]host[:port]
    server_raw = (rt.LDAP_SERVER or "").strip()
    use_ssl = server_raw.lower().startswith("ldaps")
    m_port = re.search(r":(\d+)\s*$", server_raw)
    port = int(m_port.group(1)) if m_port else (636 if use_ssl else None)  # None = default ldap3 (389/636)
    host = re.sub(r"^ldaps?://", "", server_raw, flags=re.I).strip("/").split(":")[0]

    # DNS-домен для форм логина вида user@domain
    dns_domain = ".".join(host.split(".")[1:]) if "." in host else (rt.LDAP_DOMAIN or "").lower()

    admin_groups = [g.strip().lower() for g in (rt.LDAP_ADMIN_GROUPS or "").split(",") if g.strip()]

    # Варианты формы логина: KST\user, user@dns.domain, user
    acct = user_for_bind.split("\\")[-1].split("@")[0]
    login_variants = []
    if user_for_bind:
        if "\\" in user_for_bind:
            login_variants.append(user_for_bind)
            if dns_domain:
                login_variants.append(f"{acct}@{dns_domain}")
        elif "@" in user_for_bind:
            login_variants.append(user_for_bind)
            if dns_domain:
                login_variants.append(f"{rt.LDAP_DOMAIN or dns_domain.split('.')[0]}\\{acct}")
        else:
            if dns_domain:
                login_variants.append(f"{acct}@{dns_domain}")
            if rt.LDAP_DOMAIN:
                login_variants.append(f"{rt.LDAP_DOMAIN}\\{acct}")
            login_variants.append(user_for_bind)
    login_variants = [v for v in dict.fromkeys(login_variants) if v]

    last_err = None
    try:
        for lv in login_variants or [None]:
            try:
                srv = ldap3.Server(host, port=port, use_ssl=use_ssl, get_info=ldap3.NONE, connect_timeout=5)
                conn = ldap3.Connection(srv, user=lv, password=pass_for_bind or None,
                                        auto_bind=True if lv else False,
                                        receive_timeout=30)
                ok = conn.search(rt.LDAP_BASE_DN,
                                 "(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))",
                                 attributes=["sAMAccountName", "displayName", "mail", "department", "title", "memberOf"],
                                 size_limit=2000, paged_size=500)
                if not ok:
                    raise RuntimeError(f"Поиск в AD не выполнен: {conn.result.get('description', '')}")
                users = []
                for e in conn.entries:
                    groups = [str(g).split(",")[0].replace("CN=", "") for g in (e.memberOf or [])]
                    users.append({
                        "username": str(e.sAMAccountName) if e.sAMAccountName else None,
                        "full_name": str(e.displayName) if e.displayName else None,
                        "email": str(e.mail) if e.mail else None,
                        "department": str(e.department) if e.department else None,
                        "position": str(e.title) if e.title else None,
                        "groups": groups,
                        "is_admin": any(g.lower() in admin_groups for g in groups),
                    })
                try:
                    conn.unbind()
                except Exception:
                    pass
                # Собираем список групп (для фильтра по группам в UI)
                group_set = {}
                for u in users:
                    for g in u.get("groups") or []:
                        group_set[g] = group_set.get(g, 0) + 1
                users_with_groups = [u for u in users if u["username"]]
                users = sorted(users_with_groups, key=lambda x: (x.get("department") or "", x.get("full_name") or x["username"]))
                return {
                    "count": len(users),
                    "users": users,
                    "base_dn": rt.LDAP_BASE_DN,
                    "groups": sorted(group_set.keys()),
                    "group_counts": group_set,
                }
            except HTTPException:
                raise
            except Exception as e:
                last_err = str(e)
                continue
        raise HTTPException(400, f"Ошибка обращения к домену: {last_err}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Ошибка обращения к домену: {e}")
