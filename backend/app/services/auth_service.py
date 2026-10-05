"""
Аутентификация: LDAP (доменные учётки) + локальные пользователи.
- Если LDAP настроен (LDAP_SERVER), сначала пробуем доменную проверку.
- Падение в локальную БД гарантирует, что портал работает даже без домена.

Пароли хранятся как PBKDF2-SHA256. Токены — HMAC-подписанные строки.
"""
import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from typing import Optional, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)

SESSION_TTL_SECONDS = 30 * 60  # 30 минут неактивности


# ---------- Пароли ----------

def hash_password(password: str) -> str:
    salt = uuid.uuid4().hex
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"pbkdf2${salt}${digest.hex()}"


def verify_local_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest_hex = stored.split("$", 2)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


# ---------- LDAP ----------

def _ldap_bind_and_lookup(username: str, password: str, bind_dn: str):
    """
    Основная проверка через ldap3 (если установлен): bind + атрибуты + группы.
    Возвращает (full_name, email, department, birth_date, admin_groups) или None.
    """
    try:
        import ldap3
    except ImportError:
        return None
    try:
        server = ldap3.Server(settings.LDAP_SERVER, get_info=ldap3.NONE, connect_timeout=5)
        conn = ldap3.Connection(server, user=bind_dn, password=password, auto_bind=True)
        attrs = ["displayName", "mail", "department", "title", "memberOf"]
        if settings.LDAP_BIRTH_ATTRIBUTE:
            attrs.append(settings.LDAP_BIRTH_ATTRIBUTE)
        base = settings.LDAP_BASE_DN or ""
        if base and conn.search(base, f"(sAMAccountName={username})", attributes=attrs):
            e = conn.entries[0]
            birth = ""
            if settings.LDAP_BIRTH_ATTRIBUTE and getattr(e, settings.LDAP_BIRTH_ATTRIBUTE, None):
                birth = str(getattr(e, settings.LDAP_BIRTH_ATTRIBUTE))
            groups = [str(g).split(",")[0].replace("CN=", "") for g in (e.memberOf or [])]
            return (
                str(e.displayName) if e.displayName else username,
                str(e.mail) if e.mail else f"{username}@{settings.MAIL_DOMAIN}",
                str(e.department) if e.department else "",
                birth,
                groups,
            )
        conn.unbind()
    except Exception as e:
        logger.warning(f"ldap3 bind не удался: {e}")
    return None


def ldap_check_credentials(username: str, password: str) -> Optional[Tuple[str, str, str, str, list]]:
    """
    Проверка логина/пароля в домене (Active Directory).
    Возвращает (full_name, email, department, birth_date, groups) или None если не прошло.
    Группы используются для назначения роли (LDAP_ADMIN_GROUPS).

    Настройки в .env:
      LDAP_SERVER=ldap://dc01.corp.local:389
      LDAP_DOMAIN=CORP            # префикс домена: CORP\\ivanov
      LDAP_BASE_DN=DC=corp,DC=local
      LDAP_ADMIN_GROUPS=ИТ-Администраторы,Domain Admins
    """
    if not settings.LDAP_SERVER:
        return None

    import socket

    bind_dn = f"{settings.LDAP_DOMAIN}\\{username}" if settings.LDAP_DOMAIN else username

    # 1) Полноценный путь через ldap3: bind + атрибуты + группы AD
    via_ldap3 = _ldap_bind_and_lookup(username, password, bind_dn)
    if via_ldap3:
        return via_ldap3

    # 2) Резервный путь без библиотек: простая LDAP-привязка (simple bind) через сокет
    try:
        def _ber_len(n: int) -> bytes:
            if n < 128:
                return bytes([n])
            b = n.to_bytes((n.bit_length() + 7) // 8, "big")
            return bytes([0x80 | len(b)]) + b

        def _ber(tag: int, payload: bytes) -> bytes:
            return bytes([tag]) + _ber_len(len(payload)) + payload

        dn_bytes = bind_dn.encode("utf-8")
        pw_bytes = password.encode("utf-8")
        msg = (
            _ber(0x02, b"\x01\x03")            # version 3
            + _ber(0x04, dn_bytes)             # bind DN
            + _ber(0x80, pw_bytes)             # simple password
        )
        packet = _ber(0x60, msg)

        host, _, port = settings.LDAP_SERVER.partition(":")
        port = int(port or 389)
        with socket.create_connection((host, port), timeout=5) as sock:
            sock.sendall(packet)
            resp = sock.recv(4096)
        ok = resp and (b"\x01\x00" in resp[-8:] or resp.count(b"\x0a\x01\x00") > 0)
        if not ok:
            return None

        # Учётные данные верны — атрибуты подтянуть нечем, группы неизвестны
        return _ldap_lookup(username, bind_dn)
    except Exception as e:
        logger.warning(f"LDAP проверка не удалась ({e}); пробуем локальную БД")
        return None


def _ldap_lookup(username: str, bind_dn: str) -> Tuple[str, str, str, str, list]:
    """Резервный поиск атрибутов через анонимный ldap3, если установлен; иначе заглушки.
    Возвращает (full_name, email, department, birth_date, groups)."""
    from app.core.config import settings
    birth = ""
    try:
        import ldap3  # noqa
        server = ldap3.Server(settings.LDAP_SERVER, get_info=ldap3.ALL)
        conn = ldap3.Connection(server, user=bind_dn, password="", authentication="ANONYMOUS", auto_bind=True)
        attrs = ["displayName", "mail", "department", "title"]
        if settings.LDAP_BIRTH_ATTRIBUTE:
            attrs.append(settings.LDAP_BIRTH_ATTRIBUTE)
        conn.search(settings.LDAP_BASE_DN, f"(sAMAccountName={username})", attributes=attrs)
        if conn.entries:
            e = conn.entries[0]
            if settings.LDAP_BIRTH_ATTRIBUTE and getattr(e, settings.LDAP_BIRTH_ATTRIBUTE, None):
                birth = str(getattr(e, settings.LDAP_BIRTH_ATTRIBUTE))
            groups = [str(g).split(",")[0].replace("CN=", "") for g in (getattr(e, "memberOf", None) or [])]
            return (
                str(e.displayName) if e.displayName else username,
                str(e.mail) if e.mail else f"{username}@{settings.MAIL_DOMAIN}",
                str(e.department) if e.department else "",
                birth,
                groups,
            )
    except Exception:
        pass
    return (username, f"{username}@{settings.MAIL_DOMAIN}", "", birth, [])


# ---------- Windows SSO (автовход доменного пользователя) ----------

# Контекст SPNEGO, ожидающий следующую «ногу» рукопожатия (NTLM двухшаговый)
_sso_pending = [None, None]  # [ctx, client_token_b64]


def sso_accept_token(auth_header: Optional[str]):
    """
    Принимает Negotiate-токен браузера (SSPI через winkerberos).
    Возвращает:
      ("challenge", token_or_none) — 401 + WWW-Authenticate (рукопожатие продолжается)
      ("ok", "DOMAIN\\user")       — пользователь уже аутентифицирован доменом
      ("fail", причина)
    """
    import base64
    import binascii
    try:
        import winkerberos as wb
    except ImportError:
        return ("fail", "SSPI недоступен: pip install winkerberos")

    if not auth_header:
        return ("challenge", None)

    parts = auth_header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() not in ("negotiate", "ntlm"):
        return ("challenge", None)
    client_token = parts[1].strip()

    # 2-я нога NTLM: берём ожидающий контекст
    if _sso_pending[0] is not None:
        ctx = _sso_pending[0]
        _sso_pending[0] = None
        _sso_pending[1] = None
    else:
        status, ctx = wb.authGSSServerInit("Negotiate")
        if status != 1:
            return ("fail", f"authGSSServerInit: {status}")

    try:
        step = wb.authGSSServerStep(ctx, client_token)
    except Exception as e:
        _sso_pending[0] = None
        return ("fail", f"authGSSServerStep: {e}")

    if step == 0:
        # нужна следующая нога: возвращаем challenge-токен клиенту
        _sso_pending[0] = ctx
        _sso_pending[1] = client_token
        response = wb.authGSSServerResponse(ctx) or None
        return ("challenge", f"Negotiate {response}" if response else "Negotiate")
    if step == 1:
        name = wb.authGSSServerUserName(ctx)
        wb.authGSSServerClean(ctx)
        return ("ok", name)
    return ("fail", f"authGSSServerStep: {step}")

def _sign(payload: bytes) -> bytes:
    return hmac.new(settings.SECRET_KEY.encode(), payload, hashlib.sha256).digest()


def create_token(username: str) -> str:
    body = json.dumps({"u": username, "exp": int(time.time()) + SESSION_TTL_SECONDS}).encode()
    body_b64 = base64.urlsafe_b64encode(body).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(_sign(body)).decode().rstrip("=")
    return f"{body_b64}.{sig}"


def verify_token(token: str) -> Optional[str]:
    """Возвращает username или None."""
    try:
        body_b64, sig = token.rsplit(".", 1)
        pad = "=" * (-len(body_b64) % 4)
        body = base64.urlsafe_b64decode(body_b64 + pad)
        expected = base64.urlsafe_b64encode(_sign(body)).decode().rstrip("=")
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(body)
        if data.get("exp", 0) < time.time():
            return None
        return data.get("u")
    except Exception:
        return None
