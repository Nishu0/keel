"""Sandboxed code execution.

Every call gets a fresh container that is destroyed afterwards, so nothing
leaks between calls or orgs. Defaults are deny-all:

- no network
- read only root filesystem, a small tmpfs for /work and /out
- non root user, no new privileges, all capabilities dropped
- cpu, memory, pids and wall clock limits
- gVisor (runsc) when asked for; hosted mode always asks

This backend shells out to the docker cli. The hosted version runs the same
contract on dedicated sandbox nodes behind an internal api, and keeps a warm
pool of paused containers.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import shutil
import time
import uuid
from dataclasses import dataclass, field

IMAGES = {"python": "python:3.13-slim", "shell": "alpine:3.21"}
MAX_OUTPUT = 64 * 1024


@dataclass
class Limits:
    cpus: float = 1.0
    memory_mb: int = 512
    pids: int = 128
    timeout_s: float = 60.0
    tmpfs_mb: int = 64


@dataclass
class SandboxResult:
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    timed_out: bool = False
    truncated: bool = False


@dataclass
class DockerSandbox:
    runtime: str | None = field(
        default_factory=lambda: os.environ.get("KEEL_SANDBOX_RUNTIME")
    )  # e.g. "runsc"
    limits: Limits = field(default_factory=Limits)
    docker: str = "docker"

    @staticmethod
    def available() -> bool:
        return shutil.which("docker") is not None

    def args(self, name: str, image: str, cmd: list[str]) -> list[str]:
        """The full docker command. Kept separate so the security flags are testable."""
        lim = self.limits
        a = [
            self.docker, "run", "--rm", "-i",
            "--name", name,
            "--network", "none",
            "--read-only",
            "--tmpfs", f"/work:rw,size={lim.tmpfs_mb}m,mode=1777",
            "--tmpfs", f"/out:rw,size={lim.tmpfs_mb}m,mode=1777",
            "--tmpfs", "/tmp:rw,size=16m,mode=1777",
            "--workdir", "/work",
            "--user", "65534:65534",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--cpus", str(lim.cpus),
            "--memory", f"{lim.memory_mb}m",
            "--memory-swap", f"{lim.memory_mb}m",
            "--pids-limit", str(lim.pids),
            "--env", "HOME=/work",
            "--env", "PYTHONDONTWRITEBYTECODE=1",
        ]  # fmt: skip
        if self.runtime:
            a += ["--runtime", self.runtime]
        return [*a, image, *cmd]

    async def run(self, image: str, cmd: list[str], stdin: str = "") -> SandboxResult:
        name = f"keel-sbx-{uuid.uuid4().hex[:12]}"
        t0 = time.monotonic()
        proc = await asyncio.create_subprocess_exec(
            *self.args(name, image, cmd),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        timed_out = False
        try:
            out, err = await asyncio.wait_for(proc.communicate(stdin.encode()), timeout=self.limits.timeout_s)
        except TimeoutError:
            timed_out = True
            # kill the container, not just the cli process
            killer = await asyncio.create_subprocess_exec(
                self.docker,
                "rm",
                "-f",
                name,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await killer.wait()
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
            out, err = await proc.communicate()
        truncated = len(out) > MAX_OUTPUT or len(err) > MAX_OUTPUT
        return SandboxResult(
            stdout=out[:MAX_OUTPUT].decode(errors="replace"),
            stderr=err[:MAX_OUTPUT].decode(errors="replace"),
            exit_code=-1 if timed_out else (proc.returncode or 0),
            duration_ms=int((time.monotonic() - t0) * 1000),
            timed_out=timed_out,
            truncated=truncated,
        )

    async def python(self, code: str) -> SandboxResult:
        # code goes in over stdin, never through a shell or the command line
        return await self.run(IMAGES["python"], ["python", "-I", "-"], stdin=code)

    async def shell(self, script: str) -> SandboxResult:
        return await self.run(IMAGES["shell"], ["sh", "-s"], stdin=script)
