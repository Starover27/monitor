# -*- coding: utf-8 -*-
"""
CertAuthority — самоподписанный CA и выпуск клиентских сертификатов (.p12) для mTLS-входа.
CA хранится в backend/ca/. Каждый пользователь получает p12 с CN=<username>, SAN UPN=<username>@<домен>.
"""
import datetime
import os
import uuid

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

CA_DIR = os.path.join("ca")
CA_KEY = os.path.join(CA_DIR, "ca.key")
CA_CRT = os.path.join(CA_DIR, "ca.crt")
SERVER_KEY = os.path.join(CA_DIR, "server.key")
SERVER_CRT = os.path.join(CA_DIR, "server.crt")


def _ensure_ca(common_name="Portal Root CA"):
    os.makedirs(CA_DIR, exist_ok=True)
    if os.path.exists(CA_KEY) and os.path.exists(CA_CRT):
        with open(CA_KEY, "rb") as f:
            key = serialization.load_pem_private_key(f.read(), password=None)
        with open(CA_CRT, "rb") as f:
            cert = x509.load_pem_x509_certificate(f.read())
        return key, cert
    key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Portal"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, key_cert_sign=True, crl_sign=True,
                                     content_commitment=False, key_encipherment=False, data_encipherment=False,
                                     key_agreement=False, encipher_only=False, decipher_only=False), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .sign(key, hashes.SHA256())
    )
    with open(CA_KEY, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                  serialization.NoEncryption()))
    with open(CA_CRT, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    return key, cert


def issue_user_cert(username: str, full_name: str = "", p12_password: str = "") -> dict:
    """Выпускает клиентский сертификат пользователя, возвращает p12 (bytes) и информацию."""
    ca_key, ca_cert = _ensure_ca()
    user_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    upn = f"{username}@{(os.environ.get('PORTAL_DNS_DOMAIN') or 'kst.local')}"
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, username),
        x509.NameAttribute(NameOID.GIVEN_NAME, full_name or username),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Portal"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    san = x509.SubjectAlternativeName([
        x509.RFC822Name(f"{username}@portal"),
        x509.OtherName(x509.oid.ExtensionOID.INTERNET, b"\x30\x14"),  # заглушка, не критично
    ]) if False else x509.SubjectAlternativeName([x509.RFC822Name(upn)])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(ca_cert.subject)
        .public_key(user_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=730))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=True, content_commitment=False,
                                     data_encipherment=True, key_agreement=True, crl_sign=False, key_cert_sign=False,
                                     encipher_only=False, decipher_only=False), critical=True)
        .add_extension(x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
        .add_extension(x509.SubjectAlternativeName([x509.RFC822Name(upn)]), critical=False)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(user_key.public_key()), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    p12 = pkcs12.serialize_key_and_certificates(
        name=username.encode(),
        key=user_key,
        cert=cert,
        cas=[ca_cert],
        encryption_algorithm=serialization.BestAvailableEncryption(p12_password.encode() or b"portal"),
    )
    return {"p12": p12, "filename": f"{username}_{uuid.uuid4().hex[:6]}.p12", "cn": username, "upn": upn}


def issue_server_cert(common_name: str) -> dict:
    """Серверный сертификат для TLS-прокси (подписан нашим CA)."""
    ca_key, ca_cert = _ensure_ca()
    if os.path.exists(SERVER_KEY) and os.path.exists(SERVER_CRT):
        return {"key": SERVER_KEY, "cert": SERVER_CRT}
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Portal"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=True, content_commitment=False,
                                     data_encipherment=False, key_agreement=False, crl_sign=False,
                                     key_cert_sign=False, encipher_only=False, decipher_only=False), critical=True)
        .add_extension(x509.SubjectAlternativeName([
            x509.DNSName(common_name),
            x509.DNSName("localhost"),
            x509.IPAddress(ipaddress_obj := __import__("ipaddress").IPv4Address("127.0.0.1")),
        ]), critical=False)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    with open(SERVER_KEY, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                  serialization.NoEncryption()))
    with open(SERVER_CRT, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    return {"key": SERVER_KEY, "cert": SERVER_CRT}


def ca_cert_pem() -> bytes:
    _, ca_cert = _ensure_ca()
    return ca_cert.public_bytes(serialization.Encoding.PEM)
