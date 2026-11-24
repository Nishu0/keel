"""Sandboxed code tools. Effect level ``sandboxed``: safe to rerun in a fresh container."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from keel.sandbox.manager import DockerSandbox
from keel.tools.registry import Registry


def register(registry: Registry, sandbox: DockerSandbox | None = None) -> None:
    sbx = sandbox or DockerSandbox()

    @registry.tool(effect="sandboxed", timeout_s=sbx.limits.timeout_s + 10)
    async def run_python(code: str) -> dict[str, Any]:
        """Run Python 3.13 in a throwaway sandbox with no network. Print what you want back."""
        return asdict(await sbx.python(code))

    @registry.tool(effect="sandboxed", timeout_s=sbx.limits.timeout_s + 10)
    async def run_shell(script: str) -> dict[str, Any]:
        """Run a POSIX shell script in a throwaway Alpine sandbox with no network."""
        return asdict(await sbx.shell(script))
