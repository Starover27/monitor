"""
MailNotifier — email-уведомления о заявках (создание, смена статуса).
- SMTP из настроек .env (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/MAIL_FROM/NOTIFY_EMAIL_TO)
- Если SMTP не настроен — письма сохраняются в папку outbox/ как .eml (для отладки и локального запуска).
"""
import logging
import os
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


class MailNotifier:
    def _enabled(self) -> bool:
        return bool(settings.SMTP_HOST and settings.MAIL_FROM)

    def send(self, to: list, subject: str, body: str) -> bool:
        """Синхронная отправка; не бросает исключений наружу."""
        try:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = settings.MAIL_FROM
            msg["To"] = ", ".join(to)
            msg.set_content(body)

            if self._enabled():
                self._smtp_send(msg)
                logger.info(f"✓ Письмо отправлено: {subject!r} -> {to}")
            else:
                self._save_outbox(msg)
                logger.info(f"SMTP не настроен — письмо сохранено в outbox: {subject!r}")
            return True
        except Exception as e:
            logger.error(f"Ошибка отправки письма ({subject!r}): {e}")
            return False

    def _smtp_send(self, msg: EmailMessage):
        host, port = settings.SMTP_HOST, settings.SMTP_PORT
        if settings.SMTP_SSL:
            with smtplib.SMTP_SSL(host, port, timeout=10, context=ssl.create_default_context()) as s:
                if settings.SMTP_USER:
                    s.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=10) as s:
                try:
                    s.starttls()
                except Exception:
                    pass
                if settings.SMTP_USER:
                    s.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                s.send_message(msg)

    def _save_outbox(self, msg: EmailMessage):
        os.makedirs("outbox", exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        safe = "".join(c if c.isalnum() else "_" for c in msg["Subject"])[:60]
        path = os.path.join("outbox", f"{stamp}-{safe}.eml")
        with open(path, "wb") as f:
            f.write(bytes(msg))

    # ---------- Шаблоны ----------

    def notify_admins_ticket_created(self, ticket_id: int, title: str, category: str,
                                     priority: str, employee: str, room: str, description: str):
        to = [settings.NOTIFY_EMAIL_TO] if settings.NOTIFY_EMAIL_TO else []
        body = (
            f"Новая заявка №{ticket_id} в системе хелпдеска\n"
            f"{'=' * 44}\n\n"
            f"Тема:      {title}\n"
            f"Категория: {category}\n"
            f"Приоритет: {priority}\n"
            f"Сотрудник: {employee}"
            + (f", кабинет {room}" if room else "") + "\n\n"
            + (f"Описание:\n{description}\n" if description else "")
            + f"\nВзять в работу: {settings.PORTAL_BASE_URL}/helpdesk/admin\n"
        )
        if to:
            self.send(to, f"[Заявка №{ticket_id}] {title}", body)

    def notify_ticket_status(self, employee_email: str, ticket_id: int, title: str, new_status: str):
        labels = {"new": "Создана", "in_progress": "В работе", "done": "Выполнена", "cancelled": "Отменена"}
        if not employee_email:
            return
        body = (
            f"Статус вашей заявки №{ticket_id} изменился.\n\n"
            f"Тема:  {title}\n"
            f"Статус: {labels.get(new_status, new_status)}\n\n"
            f"Проверить: {settings.PORTAL_BASE_URL}/helpdesk\n"
        )
        self.send([employee_email], f"[Заявка №{ticket_id}] Статус: {labels.get(new_status, new_status)}", body)

    def notify_admins_portal_request(self, request_id: int, kind: str, employee: str,
                                     date_from: str, date_to: str, details: str):
        to = [settings.NOTIFY_EMAIL_TO] if settings.NOTIFY_EMAIL_TO else []
        body = (
            f"Новое заявление №{request_id} через портал сотрудников\n"
            f"{'=' * 48}\n\n"
            f"Тип:       {kind}\n"
            f"Сотрудник: {employee}\n"
            + (f"Период:    {date_from} — {date_to}\n" if date_from else "")
            + (f"\nТекст:\n{details}\n" if details else "")
            + f"\nРассмотреть: {settings.PORTAL_BASE_URL}/portal\n"
        )
        if to:
            self.send(to, f"[Портал] {kind} №{request_id} — {employee}", body)

    def notify_portal_status(self, employee_email: str, request_id: int, kind: str, new_status: str, comment: str):
        labels = {"new": "Принято", "in_progress": "На рассмотрении", "done": "Одобрено", "rejected": "Отклонено"}
        if not employee_email:
            return
        body = (
            f"Статус вашего заявления №{request_id} ({kind}) изменился.\n\n"
            f"Статус: {labels.get(new_status, new_status)}\n"
            + (f"Комментарий: {comment}\n" if comment else "")
            + f"\nПроверить: {settings.PORTAL_BASE_URL}/portal\n"
        )
        self.send([employee_email], f"[Портал] {kind} №{request_id}: {labels.get(new_status, new_status)}", body)

    def notify_task_forwarded(self, to_user: str, title: str, due_date: str, author: str, document: str = ""):
        """Уведомление о переадресованной задаче — на почту получателя."""
        email = None
        try:
            from app.core.database import SessionLocal
            from app.models import User
            db = SessionLocal()
            try:
                u = db.query(User).filter((User.full_name == to_user) | (User.username == to_user)).first()
                email = u.email if u else None
            finally:
                db.close()
        except Exception:
            email = None
        body = (
            f"Вам переадресована задача через портал сотрудников\n"
            f"{'=' * 48}\n\n"
            f"Задача:    {title}\n"
            + (f"Срок:      {due_date}\n" if due_date else "")
            + (f"Документ:  {document}\n" if document else "")
            + f"От:        {author}\n"
            + f"\nПринять/выполнить: {settings.PORTAL_BASE_URL}/portal (календарь-органайзер)\n"
        )
        if email:
            self.send([email], f"[Задача] {title} — от {author}", body)
        # и админам на общий ящик
        if settings.NOTIFY_EMAIL_TO:
            self.send([settings.NOTIFY_EMAIL_TO], f"[Задача] {title} — от {author} → {to_user}", body)


mail_notifier = MailNotifier()
