"""
Конфигурация приложения
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Настройки приложения из переменных окружения"""
    
    # Основные настройки
    APP_NAME: str = "Monitoring System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # База данных
    DATABASE_URL: str = "sqlite:///./monitoring.db"
    
    # API
    API_PREFIX: str = "/api"
    
    # Безопасность
    AGENT_TOKEN_HEADER: str = "X-Agent-Token"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    
    # Хранение истории
    HISTORY_RETENTION_DAYS: int = 90

    # --- Алерты и уведомления ---
    # Сколько последних проверок подряд должны быть НЕ "up", чтобы сработал алерт
    ALERT_CONSECUTIVE_FAILURES: int = 2
    # Как часто (в секундах) фоновая задача проверяет сервисы на предмет алертов
    ALERT_CHECK_INTERVAL_SECONDS: int = 30

    # Каналы уведомлений: telegram | discord | slack | none
    NOTIFICATION_CHANNEL: str = "none"

    # Telegram
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None

    # Discord / Slack webhook URL (общий параметр)
    WEBHOOK_URL: Optional[str] = None

    
    # CORS
    ALLOWED_ORIGINS: list = ["http://localhost:3000", "http://localhost:5173", "http://localhost"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
