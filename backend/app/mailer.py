"""Pluggable email sender.

Uses real SMTP when configured via env vars; otherwise falls back to logging
the message (so dev and the password-reset flow keep working without a mail
server). Sending is best-effort and never raises to the caller.

Env vars:
  SMTP_HOST       SMTP server host. If empty -> log-only mode (default).
  SMTP_PORT       Default 587.
  SMTP_USERNAME   Optional login user.
  SMTP_PASSWORD   Optional login password.
  SMTP_FROM       From address. Default "no-reply@schoolerp.local".
  SMTP_USE_TLS    STARTTLS on connect. Default "true".
  SMTP_USE_SSL    Use implicit TLS (SMTP over SSL, e.g. port 465). Default "false".
  SMTP_TIMEOUT    Socket timeout seconds. Default 10.
"""

import os
import ssl
import smtplib
import logging
from email.message import EmailMessage

logger = logging.getLogger("mailer")


def _env_bool(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def is_configured() -> bool:
    return bool(os.getenv("SMTP_HOST", "").strip())


def _from_address() -> str:
    return os.getenv("SMTP_FROM", "no-reply@schoolerp.local").strip()


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns True if sent (or logged in dev mode),
    False on a hard failure. Never raises.
    """
    if not is_configured():
        # Log-only mode: no SMTP server configured.
        logger.info(
            "[email:log-mode] To=%s | Subject=%s\n%s", to, subject, body
        )
        return True

    host = os.getenv("SMTP_HOST").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    use_ssl = _env_bool("SMTP_USE_SSL", "false")
    use_tls = _env_bool("SMTP_USE_TLS", "true")
    timeout = int(os.getenv("SMTP_TIMEOUT", "10"))

    message = EmailMessage()
    message["From"] = _from_address()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        if use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=timeout, context=context) as server:
                if username:
                    server.login(username, password)
                server.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as server:
                if use_tls:
                    server.starttls(context=ssl.create_default_context())
                if username:
                    server.login(username, password)
                server.send_message(message)
        logger.info("Email sent to %s (subject=%s)", to, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False
