from __future__ import annotations

from collections import Counter

from keel.queue.scheduler import FairScheduler
from keel.store.base import RunDoc


def runs(org: str, n: int) -> list[RunDoc]:
    return [RunDoc(id=f"{org}_{i}", org_id=org, agent_id="a") for i in range(n)]


def test_a_noisy_org_does_not_starve_others():
    s = FairScheduler(limit_for=lambda o: 100)
    queued = runs("noisy", 5000) + runs("quiet_a", 3) + runs("quiet_b", 3)
    picked = s.pick(queued, slots=9)
    counts = Counter(r.org_id for r in picked)
    assert counts == {"noisy": 3, "quiet_a": 3, "quiet_b": 3}


def test_concurrency_limit_per_org():
    s = FairScheduler(limit_for=lambda o: 2)
    picked = s.pick(runs("a", 10), slots=8)
    assert len(picked) == 2
    assert s.pick(runs("a", 10), slots=8) == []  # still at the cap
    s.done("a")
    assert len(s.pick(runs("a", 10), slots=8)) == 1


def test_oldest_first_within_an_org_and_weights():
    s = FairScheduler(limit_for=lambda o: 50, weight_for=lambda o: 3 if o == "team" else 1)
    picked = s.pick(runs("team", 10) + runs("free", 10), slots=8)
    team = [r.id for r in picked if r.org_id == "team"]
    assert team == sorted(team, key=lambda x: int(x.split("_")[1]))
    assert Counter(r.org_id for r in picked) == {"team": 6, "free": 2}
