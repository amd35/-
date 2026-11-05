"""Outgoing email for verification codes and password resets.

Without SMTP credentials nothing is sent: the code is written to the server log
so an operator can hand it over. The API never returns the code itself.
"""
import logging
import smtplib
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("app.mailer")


def send_email(to: str, subject: str, body: str) -> bool:
    if not settings.mail_configured:
        log.warning("SMTP not configured; would have emailed %s: %s | %s", to, subject, body)
        return False
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
        return True
    except Exception as exc:  # pragma: no cover - depends on external provider
        log.error("Sending mail to %s failed: %s", to, exc)
        return False
