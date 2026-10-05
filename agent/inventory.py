"""Local inventory only; certificate private material never leaves the host."""
import os
import re
import socket
import ssl
import tempfile
import time
import hashlib
from datetime import datetime, timezone
from pathlib import Path
import psutil


def decode_certificate(data):
    pem = data.decode("ascii") if data.startswith(b"-----BEGIN CERTIFICATE-----") else ssl.DER_cert_to_PEM_cert(data)
    name = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pem", delete=False) as handle:
            name = handle.name
            handle.write(pem.encode("ascii"))
        info = ssl._ssl._test_decode_cert(name)
        subject = dict(pair for item in info.get("subject", ()) for pair in item)
        issuer = dict(pair for item in info.get("issuer", ()) for pair in item)
        return {
            "name": subject.get("commonName") or subject.get("organizationName") or "Без CN",
            "issuer": issuer.get("commonName", "—"),
            "not_before": datetime.fromtimestamp(ssl.cert_time_to_seconds(info["notBefore"]), timezone.utc).isoformat(),
            "not_after": datetime.fromtimestamp(ssl.cert_time_to_seconds(info["notAfter"]), timezone.utc).isoformat(),
            "fingerprint": hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem)).hexdigest(),
        }
    finally:
        if name:
            os.unlink(name)


def scan_certificates(roots):
    certificates, errors = [], []
    seen = set()
    inspected = 0
    for root in roots:
        base = Path(root).expanduser().resolve()
        try:
            if not base.is_dir():
                errors.append(f"Каталог недоступен: {base}")
                continue
        except OSError as exc:
            # Недоступный UNC-путь или отказ в доступе не должен ломать весь снимок
            errors.append(f"Каталог недоступен: {base} ({exc.strerror or exc})")
            continue
        def onerror(exc):
            if len(errors) < 999:
                errors.append(f"Нет доступа: {exc.filename}")
        for directory, dirs, files in os.walk(base, followlinks=False, onerror=onerror):
            dirs[:] = [d for d in dirs if not Path(directory, d).is_symlink() and not os.path.isjunction(Path(directory, d))] if hasattr(os.path, "isjunction") else [d for d in dirs if not Path(directory, d).is_symlink()]
            for filename in files:
                path = Path(directory, filename)
                if path.suffix.lower() not in {".cer", ".crt", ".pem", ".der"} or path.is_symlink():
                    continue
                try:
                    resolved = path.resolve()
                except OSError:
                    continue
                if not resolved.is_relative_to(base) or str(resolved) in seen:
                    continue
                seen.add(str(resolved))
                inspected += 1
                if inspected > 10000 or len(certificates) >= 10000:
                    return certificates, errors[:999] + ["Достигнут лимит 10 000 сертификатов/файлов"]
                try:
                    with path.open("rb") as handle:
                        data = handle.read(4 * 1024 * 1024 + 1)
                    if len(data) > 4 * 1024 * 1024:
                        raise ValueError("файл больше 4 MiB")
                    blocks = re.findall(rb"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", data, re.S)
                    if b"-----BEGIN" in data and not blocks:
                        continue  # Ignore private-key-only PEM files.
                    for index, block in enumerate(blocks or [data]):
                        if len(certificates) >= 10000:
                            return certificates, errors[:999] + ["Достигнут лимит 10 000 сертификатов"]
                        certificates.append({**decode_certificate(block), "path": str(path), "index": index})
                except (OSError, ValueError, UnicodeError) as exc:
                    if len(errors) < 999:
                        errors.append(f"{path}: {exc}")
    return certificates, errors


def collect(config):
    roots = config.get("certificate_roots", [])
    certificates, errors = scan_certificates(roots)
    disks = []
    for part in psutil.disk_partitions():
        if "cdrom" in part.opts:
            continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disks.append({"path": part.mountpoint, "filesystem": part.fstype, "total": usage.total,
                          "free": usage.free, "used": usage.used, "percent": usage.percent})
        except OSError as exc:
            errors.append(f"Диск {part.mountpoint}: {exc}")
    services = []
    for name in config.get("windows_services", []):
        try:
            service = psutil.win_service_get(name).as_dict()
            services.append({"name": name, "display_name": service["display_name"], "status": service["status"]})
        except (psutil.Error, OSError, AttributeError) as exc:
            services.append({"name": name, "status": "unknown", "error": str(exc)})
    addresses = sorted({addr.address.split("%")[0] for entries in psutil.net_if_addrs().values()
                        for addr in entries if addr.family in (socket.AF_INET, socket.AF_INET6)})
    return {"host_id": config["host_id"], "hostname": socket.gethostname(), "addresses": addresses[:64],
            "timestamp": datetime.now(timezone.utc).isoformat(), "uptime_seconds": max(0, time.time() - psutil.boot_time()),
            "certificates": certificates, "disks": disks[:256], "services": services[:1000],
            "roots": roots[:32], "errors": errors[:1000]}