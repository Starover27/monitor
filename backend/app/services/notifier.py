"""
Модуль уведомлений — отправка сообщений об алертах в каналы (Telegram/Discord/Slack).
Не падает при сетевых ошибках, логирует проблемы.
"""
import logging
from typing import Optional
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


class Notifier:
    """Отправляет уведомления о критических алертах в настроенный канал."""

    def __init__(self):
        self.channel = settings.NOTIFICATION_CHANNEL.lower()
        self.client = httpx.AsyncClient(timeout=10.0)

    async def send(self, service_name: str, target: str, message: str) -> bool:
        """
        Отправляет уведомление.
        Формат: "🚨 Сервис [Имя] на хосте [IP] недоступен! [доп. инфо]"
        """
        text = f"🚨 Сервис **{service_name}** на хосте `{target}` недоступен!\n\n{message}"

        try:
            if self.channel == "telegram":
                return await self._send_telegram(text)
            elif self.channel == "discord":
                return await self._send_discord(text)
            elif self.channel == "slack":
                return await self._send_slack(text)
            elif self.channel == "none":
                logger.debug(f"Уведомления отключены (channel=none). Текст: {text}")
                return True
            else:
                logger.warning(f"Неизвестный канал уведомлений: {self.channel}")
                return False
        except Exception as e:
            logger.error(f"Ошибка отправки уведомления: {e}", exc_info=True)
            return False

    async def _send_telegram(self, text: str) -> bool:
        """Отправка в Telegram Bot API: POST sendMessage."""
        bot_token = settings.TELEGRAM_BOT_TOKEN
        chat_id = settings.TELEGRAM_CHAT_ID

        if not bot_token or not chat_id:
            logger.error("TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не настроены")
            return False

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }

        try:
            resp = await self.client.post(url, json=payload)
            resp.raise_for_status()
            logger.info(f"✓ Telegram уведомление отправлено: {chat_id}")
            return True
        except httpx.HTTPStatusError as e:
            logger.error(f"Telegram API вернул {e.response.status_code}: {e.response.text}")
            return False
        except Exception as e:
            logger.error(f"Ошибка при отправке в Telegram: {e}")
            return False

    async def _send_discord(self, text: str) -> bool:
        """Отправка в Discord webhook."""
        webhook_url = settings.WEBHOOK_URL
        if not webhook_url:
            logger.error("WEBHOOK_URL для Discord не настроен")
            return False

        payload = {"content": text}

        try:
            resp = await self.client.post(webhook_url, json=payload)
            resp.raise_for_status()
            logger.info("✓ Discord уведомление отправлено")
            return True
        except Exception as e:
            logger.error(f"Ошибка при отправке в Discord: {e}")
            return False

    async def _send_slack(self, text: str) -> bool:
        """Отправка в Slack webhook."""
        webhook_url = settings.WEBHOOK_URL
        if not webhook_url:
            logger.error("WEBHOOK_URL для Slack не настроен")
            return False

        payload = {"text": text}

        try:
            resp = await self.client.post(webhook_url, json=payload)
            resp.raise_for_status()
            logger.info("✓ Slack уведомление отправлено")
            return True
        except Exception as e:
            logger.error(f"Ошибка при отправке в Slack: {e}")
            return False

    async def close(self):
        """Закрыть HTTP-клиент."""
        await self.client.aclose()


# Singleton
notifier = Notifier()
