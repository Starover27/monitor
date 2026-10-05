# -*- coding: utf-8 -*-
"""
Cert router — mTLS-вход по клиентским сертификатам.
  GET  /api/cert/ca            — скачать CA-сертификат (для установки на клиенте)
  POST /api/cert/issue         — (админ) выпустить p12 пользователю
  GET  /api/auth/cert-user     — (через прокси) вход по заголовку X-AD-USER
"""
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.auth import require_admin, create_token
from app.models import User
from app.services import cert_authority as ca
from app.schemas import LoginResponse, UserResponse

router = APIRouter(
    prefix="/cert",
    tags=["Cert"],
)


@router.get("/ca")
def download_ca():
    """CA-сертификат для добавления в доверенные на клиентских ПК."""
    pem = ca.ca_cert_pem()
    return Response(content=pem, media_type="application/x-x509-ca-cert",
                    headers={"Content-Disposition": 'attachment; filename="portal-ca.crt"'})


@router.post("/issue")
def issue_cert(payload: dict, admin=Depends(require_admin), db: Session = Depends(get_db)):
    username = (payload or {}).get("username", "").strip()
    password = (payload or {}).get("password", "")
    if not username:
        raise HTTPException(400, "Укажите username")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    res = ca.issue_user_cert(username, user.full_name or username, password or "portal")
    return Response(
        content=res["p12"],
        media_type="application/x-pkcs12",
        headers={"Content-Disposition": f'attachment; filename="{res["filename"]}"'},
    )


@router.get("/me", response_model=LoginResponse)
def cert_user(request: Request, db: Session = Depends(get_db)):
    """Только через mTLS-прокси: заголовок X-AD-USER = username из клиентского сертификата."""
    username = request.headers.get("x-ad-user", "").strip()
    if not username:
        raise HTTPException(401, "Клиентский сертификат не предъявлен (нужен доступ через https://…:8443)")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        # первый вход по сертификату — создаём профиль
        user = User(username=username, full_name=username, is_domain=True, role="employee")
        db.add(user)
        db.commit()
        db.refresh(user)
    if user.disabled:
        raise HTTPException(403, "Учётная запись заблокирована")
    token = create_token(user.username)
    return LoginResponse(token=token, user=UserResponse.model_validate(user))
