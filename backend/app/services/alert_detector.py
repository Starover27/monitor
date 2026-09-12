"""
Детектор алертов — фоновая задача.

Логика:
- Для каждого включённого сервиса берём N последних проверок (N = ALERT_CONSECUTIVE_FAILURES).
- Если все они НЕ "up" (т.е. сервис не прислал "UP" >= 2 раз подряд) И нет открытого
  алерта — создаём алерт и отправляем уведомление.
- Если сервис снова "up" и есть открытый алерт — закрываем его (resolve).

Дедупликация: пока существует незакрытый (is_resolved=False) алерт для сервиса,
новый не создаётся, чтобы не спамить уведомлениями.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.config import settings
from app.models import Service, StatusHistory, Alert
from app.services.notifier import notifier

logger = logging.getLogger(__name__)


async def detect_alerts():
    """Одна итерация проверки всех сервисов на предмет алертов."""
    db: Session = SessionLocal()
    try:
        threshold = settings.ALERT_CONSECUTIVE_FAILURES
        services = db.query(Service).filter(Service.enabled == True).all()

        for service in services:
            # Последние N проверок этого сервиса
            recent = (
                db.query(StatusHistory)
                .filter(StatusHistory.service_id == service.id)
                .order_by(desc(StatusHistory.checked_at))
                .limit(threshold)
                .all()
            )

            # Открытый алерт (если есть)
            open_alert = (
                db.query(Alert)
                .filter(Alert.service_id == service.id, Alert.is_resolved == False)
                .order_by(desc(Alert.created_at))
                .first()
            )

            # Недостаточно данных для решения
            if len(recent) < threshold:
                continue

            # Все N последних проверок НЕ "up" => сервис недоступен подряд
            all_failing = all(h.status != "up" for h in recent)
            latest_is_up = recent[0].status == "up"

            if all_failing and open_alert is None:
                # Генерируем новый алерт
                last_error = recent[0].error_message or "Нет ответа от сервиса"
                message = (
                    f"Сервис не отвечает {threshold} раз(а) подряд. "
                    f"Последняя ошибка: {last_error}"
                )
                alert = Alert(
                    service_id=service.id,
                    alert_type="down",
                    message=message,
                    severity="critical",
                    is_resolved=False,
                )
                db.add(alert)
                db.commit()
                db.refresh(alert)

                logger.warning(
                    f"🚨 АЛЕРТ создан: service='{service.name}' ({service.target})"
                )

                # Отправляем уведомление (не блокируем при ошибке)
                await notifier.send(
                    service_name=service.name,
                    target=service.target,
                    message=message,
                )

            elif latest_is_up and open_alert is not None:
                # Сервис восстановился — закрываем алерт
                open_alert.is_resolved = True
                open_alert.resolved_at = datetime.now(timezone.utc)
                db.commit()
                logger.info(
                    f"✓ АЛЕРТ закрыт (recovered): service='{service.name}'"
                )

    except Exception as e:
        logger.error(f"Ошибка в detect_alerts: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()
