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
