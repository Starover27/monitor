"""
API зависимости для эндпоинтов
"""
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
    Проверка токена агента.
    В MVP - простая проверка на непустоту.
    В продакшене: JWT или хранение токенов в БД.
    """
    if not x_agent_token or len(x_agent_token.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing agent token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # TODO: Добавить реальную валидацию токена из БД
    # Сейчас принимаем любой непустой токен
    return x_agent_token
