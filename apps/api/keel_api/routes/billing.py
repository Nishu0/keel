"""Plan, usage and Stripe."""

from __future__ import annotations

import logging
import os
from dataclasses import asdict
from typing import Any

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from keel.accounts.billing import (
    BillingNotConfigured,
    apply_event,
    checkout_url,
    client,
    portal_url,
    usage_this_month,
)
from keel.accounts.models import Plan
from keel.accounts.plans import PLANS, limits

from ..deps import Caller, Owner, State, Viewer, audit

router = APIRouter(prefix="/v1", tags=["billing"])
log = logging.getLogger("keel.billing")


async def quota_problem(st: Any, c: Caller) -> str | None:
    """Why this org can't start another run right now, or None. Orgs without an
    account record (single org dev mode) aren't limited."""
    org = await st.accounts.get_org(c.org_id)
    if org is None:
        return None
    lim = limits(org.plan)
    used = await usage_this_month(st.store, c.org_id)
    if used.runs >= lim.runs_per_month:
        return (
            f"the {org.plan} plan includes {lim.runs_per_month:,} runs a month and they're used up; "
            "upgrade to keep going"
        )
    if used.tokens >= lim.tokens_per_month:
        return (
            f"the {org.plan} plan includes {lim.tokens_per_month:,} tokens a month and they're used up; "
            "upgrade to keep going"
        )
    return None


@router.get("/billing")
async def billing(c: Viewer, st: State) -> dict[str, Any]:
    org = await st.accounts.get_org(c.org_id)
    plan = org.plan if org else Plan.TEAM
    used = await usage_this_month(st.store, c.org_id)
    members = len(await st.accounts.list_members(c.org_id))
    return {
        "plan": plan,
        "limits": asdict(limits(plan)),
        "usage": {**asdict(used), "tokens": used.tokens, "members": members},
        "plans": {p.value: asdict(v) for p, v in PLANS.items()},
        "stripe": bool(os.environ.get("STRIPE_SECRET_KEY")),
        "has_billing_account": bool(org and org.stripe_customer_id),
    }


class CheckoutIn(BaseModel):
    plan: Plan


@router.post("/billing/checkout")
async def checkout(body: CheckoutIn, c: Owner, st: State) -> dict[str, str]:
    if body.plan is Plan.FREE:
        raise HTTPException(422, "to go back to free, cancel from the billing portal")
    org = await st.accounts.get_org(c.org_id)
    if org is None:
        raise HTTPException(404, "no org")
    try:
        url = await checkout_url(
            client(), st.accounts, org, body.plan, c.user.email if c.user else None, st.public_url
        )
    except BillingNotConfigured as e:
        raise HTTPException(503, str(e)) from e
    await audit(st, c, "billing.checkout_started", org.id, plan=body.plan)
    return {"url": url}


@router.post("/billing/portal")
async def portal(c: Owner, st: State) -> dict[str, str]:
    org = await st.accounts.get_org(c.org_id)
    if org is None:
        raise HTTPException(404, "no org")
    try:
        return {"url": await portal_url(client(), org, st.public_url)}
    except BillingNotConfigured as e:
        raise HTTPException(503, str(e)) from e


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, st: State) -> dict[str, str]:
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(503, "set STRIPE_WEBHOOK_SECRET to receive stripe events")
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, request.headers.get("stripe-signature"), secret)
    except (ValueError, stripe.SignatureVerificationError) as e:
        raise HTTPException(400, "bad signature") from e
    what = await apply_event(st.accounts, event.to_dict() if hasattr(event, "to_dict") else dict(event))
    log.info("stripe %s: %s", event["type"], what)
    return {"status": what}
