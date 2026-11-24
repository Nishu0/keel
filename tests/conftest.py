from __future__ import annotations

import pytest

from keel.store.memory import MemoryStore
from tests.helpers import Desk


@pytest.fixture
def store() -> MemoryStore:
    return MemoryStore()


@pytest.fixture
def desk() -> Desk:
    return Desk()


@pytest.fixture(autouse=True)
def _private_network_ok(monkeypatch):
    # tests talk to fake hosts and local servers; tests/unit/test_net.py turns the guard back on
    monkeypatch.setenv("KEEL_ALLOW_PRIVATE_NETWORK", "1")
