"""Stripe subscriptions, and how much an org has used this month."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import stripe

from keel.accounts.models import Org, Plan
from keel.accounts.store import AccountStore
from keel.core.fold import fold
from keel.store.base import Store


class BillingNotConfigured(RuntimeError):
    pass


def price_for(plan: Plan) -> str:
    env = {Plan.PRO: "STRIPE_PRICE_PRO", Plan.TEAM: "STRIPE_PRICE_TEAM"}.get(plan)
    price = os.environ.get(env, "") if env else ""
    if not price:
        raise BillingNotConfigured(f"set {env} to sell the {plan} plan")
    return price


def plan_for_price(price_id: str) -> Plan | None:
    for plan, env in ((Plan.PRO, "STRIPE_PRICE_PRO"), (Plan.TEAM, "STRIPE_PRICE_TEAM")):
        if price_id and os.environ.get(env) == price_id:
            return plan
    return None


def client() -> stripe.StripeClient:
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not key:
        raise BillingNotConfigured("set STRIPE_SECRET_KEY to enable billing")
    return stripe.StripeClient(key)


async def ensure_customer(
    sc: stripe.StripeClient, accounts: AccountStore, org: Org, email: str | None
) -> str:
    if org.stripe_customer_id:
        return org.stripe_customer_id
    params: dict[str, Any] = {"name": org.name, "metadata": {"org_id": org.id}}
    if email:
        params["email"] = email
    customer = await sc.v1.customers.create_async(params)
    await accounts.update_org(org.id, stripe_customer_id=customer.id)
    return customer.id


async def checkout_url(
    sc: stripe.StripeClient, accounts: AccountStore, org: Org, plan: Plan, email: str | None, public_url: str
) -> str:
    customer = await ensure_customer(sc, accounts, org, email)
    session = await sc.v1.checkout.sessions.create_async(
        {
            "mode": "subscription",
            "customer": customer,
            "line_items": [{"price": price_for(plan), "quantity": 1}],
            "success_url": f"{public_url.rstrip('/')}/app/settings/billing?upgraded=1",
            "cancel_url": f"{public_url.rstrip('/')}/app/settings/billing",
            "client_reference_id": org.id,
            "subscription_data": {"metadata": {"org_id": org.id}},
            "allow_promotion_codes": True,
        }
    )
    return session.url


async def portal_url(sc: stripe.StripeClient, org: Org, public_url: str) -> str:
    if not org.stripe_customer_id:
        raise BillingNotConfigured("this org has no billing account yet; upgrade first")
    session = await sc.v1.billing_portal.sessions.create_async(
        {"customer": org.stripe_customer_id, "return_url": f"{public_url.rstrip('/')}/app/settings/billing"}
    )
    return session.url


async def apply_event(accounts: AccountStore, event: dict[str, Any]) -> str:
    """Bring an org's plan in line with its subscription. Returns what happened, for the log."""
    kind = event.get("type", "")
    obj = event.get("data", {}).get("object", {})
    if kind == "checkout.session.completed":
        org_id = obj.get("client_reference_id")
        if org_id and obj.get("customer"):
            await accounts.update_org(
                org_id, stripe_customer_id=obj["customer"], stripe_subscription_id=obj.get("subscription")
            )
        return "linked customer"
    if kind in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        org = await accounts.org_by_stripe_customer(obj.get("customer", ""))
        if org is None:
            return "no org for customer"
        items = obj.get("items", {}).get("data", [])
        price = items[0].get("price", {}).get("id", "") if items else ""
        active = (
            obj.get("status") in ("active", "trialing", "past_due")
            and kind != "customer.subscription.deleted"
        )
        plan = (plan_for_price(price) or Plan.FREE) if active else Plan.FREE
        await accounts.update_org(org.id, plan=plan, stripe_subscription_id=obj.get("id") if active else None)
        return f"plan {plan}"
    return "ignored"


@dataclass
class MonthUsage:
    runs: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    active_runs: int

    @property
    def tokens(self) -> int:
        return self.input_tokens + self.output_tokens


def month_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def usage_this_month(store: Store, org_id: str) -> MonthUsage:
    """Folded from the event log for now; the hosted version keeps a running rollup."""
    since = month_start()
    runs = inp = out = active = 0
    cost = 0.0
    for r in await store.list_runs(org_id, limit=100_000):
        if r.status in ("running", "waiting", "queued"):
            active += 1
        events = await store.events(org_id, r.id)
        if not events or events[0].ts < since:
            continue
        runs += 1
        s = fold(events)
        inp, out, cost = inp + s.input_tokens, out + s.output_tokens, cost + s.cost_usd
    return MonthUsage(
        runs=runs, input_tokens=inp, output_tokens=out, cost_usd=round(cost, 6), active_runs=active
    )
