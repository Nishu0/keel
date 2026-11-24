"""Tell people when a run needs them: an approval, or an in doubt call to settle.

Slack when the org has a SLACK_WEBHOOK_URL secret, email to owners and admins
always. Notifying is best effort: a failure is logged and never touches the run.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

import httpx

from keel.accounts.email import Mailer
from keel.accounts.models import Role
from keel.accounts.store import AccountStore
from keel.security.crypto import Sealer

log = logging.getLogger("keel.notify")

Notify = Callable[[str, str, str, str], Awaitable[None]]  # org_id, run_id, kind, detail

SUBJECT = {
    "approval": "A run is waiting for your approval",
    "review": "A run needs a decision",
}


def notifier(
    accounts: AccountStore,
    mailer: Mailer,
    sealer: Sealer | None,
    public_url: str,
    http: httpx.AsyncClient | None = None,
) -> Notify:
    async def notify(org_id: str, run_id: str, kind: str, detail: str) -> None:
        link = f"{public_url.rstrip('/')}/app/runs/{run_id}"
        subject = SUBJECT.get(kind, "A run needs attention")
        text = f"{subject}: {detail}\n{link}"
        try:
            await _slack(org_id, text)
        except Exception as e:  # never let a notification break a run
            log.warning("slack notify failed for %s: %s", run_id, e)
        try:
            for m in await accounts.list_members(org_id):
                if m.role in (Role.OWNER, Role.ADMIN):
                    user = await accounts.get_user(m.user_id)
                    if user:
                        await mailer.send(user.email, subject, f"{detail}\n\nOpen the run: {link}")
        except Exception as e:
            log.warning("email notify failed for %s: %s", run_id, e)

    async def _slack(org_id: str, text: str) -> None:
        if sealer is None:
            return
        s = await accounts.get_secret(org_id, "SLACK_WEBHOOK_URL")
        if s is None:
            return
        url = sealer.open(org_id, s.name, s.ciphertext, s.nonce)
        if not url.startswith("https://hooks.slack.com/"):
            log.warning("SLACK_WEBHOOK_URL for %s isn't a slack webhook; skipping", org_id)
            return
        client = http or httpx.AsyncClient(timeout=10)
        try:
            r = await client.post(url, json={"text": text})
            r.raise_for_status()
        finally:
            if http is None:
                await client.aclose()

    return notify
