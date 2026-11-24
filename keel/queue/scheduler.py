"""Fair scheduling across orgs.

One queue per org. The scheduler takes runs round robin across orgs, oldest
first within an org, and never lets an org exceed its concurrency limit. An org
that starts 5,000 runs gets its share, not the whole fleet.
"""

from __future__ import annotations

from collections import OrderedDict, defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field

from keel.store.base import RunDoc


@dataclass
class FairScheduler:
    limit_for: Callable[[str], int] = lambda org_id: 20
    weight_for: Callable[[str], int] = lambda org_id: 1
    active: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    _cursor: int = 0

    def pick(self, queued: Iterable[RunDoc], slots: int) -> list[RunDoc]:
        """Choose up to ``slots`` runs from ``queued`` (oldest first)."""
        by_org: OrderedDict[str, list[RunDoc]] = OrderedDict()
        for r in queued:
            by_org.setdefault(r.org_id, []).append(r)
        orgs = list(by_org)
        if not orgs or slots <= 0:
            return []

        # rotate the starting org between calls so ties don't always favour the same one
        start = self._cursor % len(orgs)
        orgs = orgs[start:] + orgs[:start]
        self._cursor += 1

        picked: list[RunDoc] = []
        while len(picked) < slots:
            progressed = False
            for org in orgs:
                for _ in range(max(1, self.weight_for(org))):
                    if len(picked) >= slots or not by_org[org]:
                        break
                    if self.active[org] >= self.limit_for(org):
                        break
                    picked.append(by_org[org].pop(0))
                    self.active[org] += 1
                    progressed = True
            if not progressed:
                break
        return picked

    def done(self, org_id: str) -> None:
        self.active[org_id] = max(0, self.active[org_id] - 1)
