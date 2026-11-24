"""Python client for the keel api.

from keel.client import Keel

keel = Keel()                                   # KEEL_API_KEY, KEEL_API_URL
run = keel.runs.create("agt_...", {"task": "Rebalance FED-DEC"})
for event in keel.runs.stream(run["id"]):
    print(event["type"], event["payload"])
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from typing import Any

import httpx

TERMINAL = {"run.completed", "run.failed", "run.cancelled", "limit.exceeded"}


class KeelError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(f"{status}: {detail}")
        self.status, self.detail = status, detail


class Keel:
    def __init__(
        self, api_key: str | None = None, base_url: str | None = None, *, http: httpx.Client | None = None
    ):
        key = api_key or os.environ.get("KEEL_API_KEY")
        if not key:
            raise ValueError("pass api_key or set KEEL_API_KEY")
        self._http = http or httpx.Client(
            base_url=base_url or os.environ.get("KEEL_API_URL", "http://localhost:8000"),
            headers={"Authorization": f"Bearer {key}"},
            timeout=httpx.Timeout(30.0, read=None),
        )
        self.runs = Runs(self)
        self.agents = Agents(self)

    def _req(self, method: str, path: str, **kw: Any) -> Any:
        r = self._http.request(method, path, **kw)
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail", r.text)
            except ValueError:
                detail = r.text
            raise KeelError(r.status_code, str(detail))
        return r.json() if r.content else None

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> Keel:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


class Runs:
    def __init__(self, keel: Keel) -> None:
        self._k = keel

    def create(self, agent_id: str, input: dict[str, Any]) -> dict[str, Any]:
        return self._k._req("POST", "/v1/runs", json={"agent_id": agent_id, "input": input})

    def get(self, run_id: str) -> dict[str, Any]:
        return self._k._req("GET", f"/v1/runs/{run_id}")

    def list(
        self, *, status: str | None = None, agent_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        params = {
            k: v for k, v in {"status": status, "agent_id": agent_id, "limit": limit}.items() if v is not None
        }
        return self._k._req("GET", "/v1/runs", params=params)

    def events(self, run_id: str, after_seq: int = 0) -> list[dict[str, Any]]:
        return self._k._req("GET", f"/v1/runs/{run_id}/events", params={"after_seq": after_seq})

    def cancel(self, run_id: str) -> dict[str, Any]:
        return self._k._req("POST", f"/v1/runs/{run_id}/cancel")

    def approve(self, run_id: str, call_id: str, approve: bool = True) -> dict[str, Any]:
        return self._k._req(
            "POST", f"/v1/runs/{run_id}/approve", json={"call_id": call_id, "approve": approve}
        )

    def resume(self, run_id: str, call_id: str, decision: str, output: Any = None) -> dict[str, Any]:
        body = {"call_id": call_id, "decision": decision, "output": output}
        return self._k._req("POST", f"/v1/runs/{run_id}/resume", json=body)

    def stream(self, run_id: str, after_seq: int = 0) -> Iterator[dict[str, Any]]:
        """Yield events as they happen. Reconnects resume from the last seq seen.

        Ends on a terminal event, or when the run pauses (approval, review).
        """
        last = after_seq
        while True:
            try:
                with self._k._http.stream(
                    "GET", f"/v1/runs/{run_id}/stream", headers={"Last-Event-ID": str(last)}
                ) as r:
                    if r.status_code >= 400:
                        r.read()
                        raise KeelError(r.status_code, r.text)
                    for line in r.iter_lines():
                        if not line.startswith("data: "):
                            continue
                        e = json.loads(line[6:])
                        last = e["seq"]
                        yield e
                        if e["type"] in TERMINAL:
                            return
                return  # stream closed without a terminal event: the run paused
            except httpx.TransportError:
                continue


class Agents:
    def __init__(self, keel: Keel) -> None:
        self._k = keel

    def create(self, name: str, **config: Any) -> dict[str, Any]:
        return self._k._req("POST", "/v1/agents", json={"name": name, **config})

    def update(self, agent_id: str, name: str, **config: Any) -> dict[str, Any]:
        """Publish a new version."""
        return self._k._req("POST", "/v1/agents", json={"id": agent_id, "name": name, **config})

    def get(self, agent_id: str) -> dict[str, Any]:
        return self._k._req("GET", f"/v1/agents/{agent_id}")

    def list(self) -> list[dict[str, Any]]:
        return self._k._req("GET", "/v1/agents")
