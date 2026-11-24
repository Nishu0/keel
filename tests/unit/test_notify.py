from __future__ import annotations

import os

import httpx
import respx

from keel.accounts.email import LogMailer
from keel.accounts.models import Membership, Org, Role, Secret, User
from keel.accounts.notify import notifier
from keel.accounts.store import MemoryAccounts
from keel.providers.fake import FakeProvider
from keel.security.crypto import Sealer
from keel.store.memory import MemoryStore
from keel.worker.loop import Outcome
from keel.worker.worker import Worker
from tests.helpers import ORG, Desk, agent, make_registry, new_run, trading_script

HOOK = "https://hooks.slack.com/services/T0/B0/xyz"


async def setup(slack: bool = True):
    accounts = MemoryAccounts()
    sealer = Sealer(os.urandom(32))
    await accounts.create_org(Org(id=ORG, name="Halyard"))
    await accounts.create_user(User(id="usr_1", email="ana@halyard.dev", name="Ana"))
    await accounts.create_user(User(id="usr_2", email="sam@halyard.dev", name="Sam"))
    await accounts.set_member(Membership(org_id=ORG, user_id="usr_1", role=Role.OWNER))
    await accounts.set_member(Membership(org_id=ORG, user_id="usr_2", role=Role.VIEWER))
    if slack:
        ct, nonce = sealer.seal(ORG, "SLACK_WEBHOOK_URL", HOOK)
        await accounts.put_secret(
            Secret(
                id="sec_1",
                org_id=ORG,
                name="SLACK_WEBHOOK_URL",
                ciphertext=ct,
                nonce=nonce,
                created_by="usr_1",
            )
        )
    return accounts, sealer


@respx.mock
async def test_an_approval_pause_tells_slack_and_the_owners():
    route = respx.post(HOOK).mock(return_value=httpx.Response(200, text="ok"))
    accounts, sealer = await setup()
    mailer = LogMailer()
    store = MemoryStore()
    await new_run(store, "run_1")
    w = Worker(
        "w-1",
        store,
        FakeProvider(trading_script(["FED"])),
        make_registry(Desk()),
        notify=notifier(accounts, mailer, sealer, "http://web.test", httpx.AsyncClient()),
    )
    out = await w.process(agent(approval_required=["place_order"]), "run_1")
    assert out is Outcome.WAITING_FOR_APPROVAL
    text = route.calls.last.request.read().decode()
    assert "waiting for your approval" in text and "http://web.test/app/runs/run_1" in text
    assert [to for to, _, _ in mailer.sent] == ["ana@halyard.dev"]  # owners and admins, not viewers


@respx.mock
async def test_a_broken_slack_hook_never_breaks_the_run():
    respx.post(HOOK).mock(return_value=httpx.Response(500))
    accounts, sealer = await setup()
    mailer = LogMailer()
    store = MemoryStore()
    await new_run(store, "run_1")
    w = Worker(
        "w-1",
        store,
        FakeProvider(trading_script(["FED"])),
        make_registry(Desk()),
        notify=notifier(accounts, mailer, sealer, "http://web.test", httpx.AsyncClient()),
    )
    assert await w.process(agent(approval_required=["place_order"]), "run_1") is Outcome.WAITING_FOR_APPROVAL
    assert mailer.sent  # email still went out


async def test_without_slack_only_email():
    accounts, sealer = await setup(slack=False)
    mailer = LogMailer()
    await notifier(accounts, mailer, sealer, "http://web.test")(
        ORG, "run_9", "review", "trading-agent can't tell"
    )
    assert mailer.sent[0][1] == "A run needs a decision"
