"""What each plan allows. Checked when a run starts, at every step, and by the scheduler."""

from __future__ import annotations

from dataclasses import dataclass

from keel.accounts.models import Plan


@dataclass(frozen=True)
class Limits:
    concurrent_runs: int
    runs_per_month: int
    tokens_per_month: int
    sandbox_minutes: int
    seats: int | None  # None: unlimited
    keel_models: bool  # may use keel's model keys instead of bringing their own


PLANS: dict[Plan, Limits] = {
    Plan.FREE: Limits(
        concurrent_runs=2,
        runs_per_month=500,
        tokens_per_month=2_000_000,
        sandbox_minutes=60,
        seats=1,
        keel_models=False,
    ),
    Plan.PRO: Limits(
        concurrent_runs=20,
        runs_per_month=20_000,
        tokens_per_month=100_000_000,
        sandbox_minutes=1_000,
        seats=5,
        keel_models=True,
    ),
    Plan.TEAM: Limits(
        concurrent_runs=100,
        runs_per_month=200_000,
        tokens_per_month=1_000_000_000,
        sandbox_minutes=10_000,
        seats=None,
        keel_models=True,
    ),
}


def limits(plan: Plan | str) -> Limits:
    return PLANS[Plan(plan)]
