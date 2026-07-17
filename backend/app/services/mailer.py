"""Provider-agnostic transactional mail delivery.

The application never exposes auth tokens.  SMTP and generic HTTP API
implementations are intentionally small adapters; provider-specific setup is
kept in environment variables and outside the auth service.
"""

from __future__ import annotations

import asyncio
import json
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol
from urllib import request as urllib_request
from urllib.parse import urlsplit

from app.core.config import Settings, settings


class MailDeliveryError(RuntimeError):
    """A configured mail provider could not accept a message."""


class Mailer(Protocol):
    def ensure_available(self) -> None: ...

    async def send(self, *, recipient: str, subject: str, text: str) -> None: ...


@dataclass(frozen=True)
class SentMessage:
    recipient: str
    subject: str
    text: str


class InMemoryMailer:
    """Test-only mailer. It stores messages in memory and sends nothing."""

    def __init__(self) -> None:
        self.messages: list[SentMessage] = []

    def ensure_available(self) -> None:
        return None

    async def send(self, *, recipient: str, subject: str, text: str) -> None:
        self.messages.append(SentMessage(recipient, subject, text))


class SMTPMailer:
    def __init__(self, config: Settings) -> None:
        self.config = config

    def ensure_available(self) -> None:
        if not self.config.email_from or not self.config.smtp_host:
            raise MailDeliveryError("Transactional email is not configured")

    async def send(self, *, recipient: str, subject: str, text: str) -> None:
        self.ensure_available()
        await asyncio.to_thread(self._send_sync, recipient, subject, text)

    def _send_sync(self, recipient: str, subject: str, text: str) -> None:
        message = EmailMessage()
        message["From"] = self.config.email_from
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(text)
        context = ssl.create_default_context()
        with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port, timeout=15) as server:
            if self.config.smtp_starttls:
                server.starttls(context=context)
            if self.config.smtp_username:
                server.login(self.config.smtp_username, self.config.smtp_password or "")
            server.send_message(message)


class APIFieldMailer:
    """Generic JSON HTTP adapter; no provider or credential is assumed."""

    def __init__(self, config: Settings) -> None:
        self.config = config

    def ensure_available(self) -> None:
        if not self.config.email_from or not self.config.email_api_url or not self.config.email_api_token:
            raise MailDeliveryError("Transactional email is not configured")

    async def send(self, *, recipient: str, subject: str, text: str) -> None:
        self.ensure_available()
        payload = json.dumps(
            {"from": self.config.email_from, "to": recipient, "subject": subject, "text": text}
        ).encode("utf-8")
        await asyncio.to_thread(self._send_sync, payload)

    def _send_sync(self, payload: bytes) -> None:
        api_url = self._validated_api_url()
        req = urllib_request.Request(
            api_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {self.config.email_api_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            # The URL is validated before it is opened.
            with urllib_request.urlopen(req, timeout=15) as response:  # nosec B310
                if response.status >= 300:
                    raise MailDeliveryError("Email provider rejected the message")
        except MailDeliveryError:
            raise
        except Exception as exc:
            raise MailDeliveryError("Email provider is unavailable") from exc

    def _validated_api_url(self) -> str:
        raw_url = self.config.email_api_url or ""
        try:
            parsed = urlsplit(raw_url)
            # Accessing port validates malformed bracketed hosts as well.
            parsed.port
        except ValueError as exc:
            raise MailDeliveryError("Email provider URL is invalid") from exc

        allowed_schemes = {"https"} if self.config.is_production else {"http", "https"}
        if (
            parsed.scheme.lower() not in allowed_schemes
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise MailDeliveryError("Email provider URL is invalid")
        return raw_url


class UnconfiguredMailer:
    def ensure_available(self) -> None:
        raise MailDeliveryError("Transactional email is not configured")

    async def send(self, *, recipient: str, subject: str, text: str) -> None:
        self.ensure_available()


def build_mailer(config: Settings) -> Mailer:
    if config.email_provider == "smtp":
        return SMTPMailer(config)
    if config.email_provider == "api":
        return APIFieldMailer(config)
    return UnconfiguredMailer()


mailer = build_mailer(settings)
