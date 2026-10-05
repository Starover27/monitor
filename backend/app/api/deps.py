"""
API зависимости для эндпоинтов
"""
import secrets
from typing import Generator
from fastapi import Header, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db as core_get_db
from app.core.config import settings


def get_db() -> Generator[Session, None, None]:
    """Dependency для получения DB сессии"""
    yield from core_get_db()


def verify_agent_token(
    x_agent_token: str = Header(..., description="Токен аутентификации агента")
) -> str:
    """
    Проверка токена агента: сверка с общим SECRET_KEY сервера
    (та же логика, что в /api/inventory и /api/discovery).
    """
    if (
        settings.SECRET_KEY == "your-secret-key-change-in-production"
        or not secrets.compare_digest(x_agent_token, settings.SECRET_KEY)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или отсутствующий токен агента (должен совпадать с SECRET_KEY сервера)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return x_agent_token
