"""Sending sign in links and invites. Resend when configured, the log otherwise."""

from __future__ import annotations

import logging
import os
from typing import Protocol

import httpx

log = logging.getLogger("keel.email")


class Mailer(Protocol):
    async def send(self, to: str, subject: str, text: str) -> None: ...


class ResendMailer:
    def __init__(self, api_key: str, sender: str) -> None:
        self.api_key, self.sender = api_key, sender

    async def send(self, to: str, subject: str, text: str) -> None:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"from": self.sender, "to": [to], "subject": subject, "text": text},
            )
        if r.status_code >= 300:
            raise RuntimeError(f"resend rejected the email ({r.status_code}): {r.text[:200]}")


class LogMailer:
    """Dev fallback: the link shows up in the api log instead of an inbox."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def send(self, to: str, subject: str, text: str) -> None:
        self.sent.append((to, subject, text))
        log.warning("email to %s (RESEND_API_KEY not set): %s\n%s", to, subject, text)


def mailer_from_env() -> Mailer:
    key = os.environ.get("RESEND_API_KEY")
    if key:
        return ResendMailer(key, os.environ.get("KEEL_EMAIL_FROM", "keel <onboarding@resend.dev>"))
    return LogMailer()
