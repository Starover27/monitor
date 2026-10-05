# -*- coding: utf-8 -*-
"""
CertProxy — HTTPS (mTLS) сервер на порту 8443:
  - требует клиентский сертификат, подписанный нашим CA
  - извлекает CN (username) и вставляет заголовок X-AD-USER
  - весь трафик → 127.0.0.1:80 (бэкенд, отдаёт и API, и портал)
Пользователь заходит на https://<сервер>:8443 и входит без пароля по сертификату.
"""
import asyncio
import ssl

TARGET_API = ("127.0.0.1", 80)
TARGET_WEB = ("127.0.0.1", 80)

_pending = {}  # transport -> метка, для отладки (не критично)


def _target_for(path: str):
    if path.startswith("/api/") or path.startswith("/static/"):
        return TARGET_API
    return TARGET_WEB


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def _handle_tls(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    ssl_obj = writer.get_extra_info("ssl_object")
    peer = None
    try:
        peer = ssl_obj.getpeercert()
    except Exception:
        pass
    username = None
    if peer:
        for rdn in peer.get("subject", ()):
            for k, v in rdn:
                if k == "commonName":
                    username = v
    # читаем заголовки HTTP (до \r\n\r\n)
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = await reader.read(65536)
        if not chunk:
            writer.close()
            return
        buf += chunk
    head, _, rest = buf.partition(b"\r\n\r\n")
    lines = head.split(b"\r\n")
    request_line = lines[0].decode("latin-1", errors="replace")
    parts = request_line.split(" ")
    path = parts[1] if len(parts) > 1 else "/"
    t_host, t_port = _target_for(path)
    if username and not path.startswith("/api/auth/"):
        # прокси добавляет доверенный заголовок только на /api (кроме auth)
        head = b"\r\n".join([lines[0]] + lines[1:] + [f"X-AD-USER: {username}".encode("latin-1")])
    else:
        head = b"\r\n".join(lines)
    try:
        tr, tw = await asyncio.open_connection(*TARGET_API if False else (t_host, t_port))
    except Exception as e:
        writer.write(f"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".encode())
        await writer.drain()
        writer.close()
        return
    first = head + b"\r\n\r\n" + rest
    tw.write(first)
    await tw.drain()
    await asyncio.gather(_pipe(reader, tw), _pipe(tr, writer))


async def start_cert_proxy(host: str = "0.0.0.0", port: int = 8443, common_name: str = "kab-6-2.kst.local"):
    from app.services.cert_authority import _ensure_ca, issue_server_cert
    _ensure_ca()
    files = issue_server_cert(common_name)
    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(certfile=files["cert"], keyfile=files["key"])
    ssl_ctx.load_verify_locations(cafile=files["cert"])  # CA = этот же файл подписи
    from app.services.cert_authority import CA_CRT
    ssl_ctx.load_verify_locations(cafile=CA_CRT)
    ssl_ctx.verify_mode = ssl.CERT_REQUIRED

    server = await asyncio.start_server(_handle_tls, host, port, ssl=ssl_ctx)
    print(f"✅ CertProxy (mTLS) слушает https://{host}:{port}")
    return server
