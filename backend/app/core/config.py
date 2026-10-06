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

        # --- Портал: аутентификация ---
    LDAP_SERVER: Optional[str] = None          # напр. ldap://dc01.corp.local:389
    LDAP_DOMAIN: Optional[str] = None          # напр. CORP (CORP\\ivanov)
    LDAP_BASE_DN: Optional[str] = None         # напр. DC=corp,DC=local
    LDAP_BIRTH_ATTRIBUTE: Optional[str] = None # атрибут AD с датой рождения (напр. extensionAttribute1)
    LDAP_ADMIN_GROUPS: str = ""                # группы AD через запятую, дающие роль админа: ИТ-Администраторы,Domain Admins
    LDAP_BIND_USER: Optional[str] = None       # служебная учётка для поиска ФИО/списка пользователей в AD
    LDAP_BIND_PASSWORD: Optional[str] = None   # её пароль
    SSO_ENABLED: bool = False                  # автовход Windows (SSPI/Negotiate) без ввода пароля
    CERT_PROXY_ENABLED: bool = True            # mTLS-прокси 8443: вход по клиентским сертификатам
    CERT_PROXY_PORT: int = 8443
    MAIL_DOMAIN: str = "corp.local"            # домен email по умолчанию

    # --- Портал: адрес для ссылок в email-уведомлениях ---
    PORTAL_BASE_URL: str = "http://localhost"   # без номера порта (порт 80)

    # --- Портал: email-уведомления ---
    SMTP_HOST: Optional[str] = None            # напр. smtp.corp.local; если пусто — письма кладутся в outbox/
    SMTP_PORT: int = 587
    SMTP_SSL: bool = False                     # True для порта 465
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    MAIL_FROM: Optional[str] = None            # напр. portal@corp.local (обязательно для отправки)
    NOTIFY_EMAIL_TO: str = "helpdesk@corp.local"  # почта, куда падают уведомления о заявках


    # CORS
    ALLOWED_ORIGINS: list = ["*"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
