from __future__ import annotations

import subprocess

import pytest

from keel.sandbox.manager import DockerSandbox, Limits
from keel.sandbox.tools import register
from keel.tools.registry import Effect, Registry


def test_security_flags_are_always_set():
    sbx = DockerSandbox(runtime="runsc", limits=Limits(cpus=0.5, memory_mb=256, pids=64))
    a = sbx.args("keel-sbx-x", "python:3.13-slim", ["python", "-I", "-"])
    joined = " ".join(a)
    for flag in [
        "--network none",
        "--read-only",
        "--user 65534:65534",
        "--cap-drop ALL",
        "--security-opt no-new-privileges",
        "--memory 256m",
        "--memory-swap 256m",
        "--pids-limit 64",
        "--cpus 0.5",
        "--runtime runsc",
        "--rm",
    ]:
        assert flag in joined, flag
    assert a[-4:] == ["python:3.13-slim", "python", "-I", "-"]


def test_no_runtime_flag_unless_asked():
    assert "--runtime" not in DockerSandbox(runtime=None).args("n", "alpine", ["sh"])


def test_tools_register_as_sandboxed():
    reg = Registry()
    register(reg, DockerSandbox(runtime=None))
    assert reg.get("run_python").effect is Effect.SANDBOXED
    assert set(reg.get("run_shell").spec.input_schema["properties"]) == {"script"}


def _docker_up() -> bool:
    if not DockerSandbox.available():
        return False
    return subprocess.run(["docker", "info"], capture_output=True).returncode == 0


@pytest.mark.skipif(not _docker_up(), reason="docker daemon not running")
async def test_real_container_is_locked_down():
    sbx = DockerSandbox(runtime=None, limits=Limits(timeout_s=60))
    r = await sbx.python(
        "import os, socket\n"
        "print(os.getuid())\n"
        "try:\n    socket.create_connection(('1.1.1.1', 80), timeout=2); print('net')\n"
        "except OSError: print('no-net')\n"
        "try:\n    open('/etc/x', 'w'); print('rw')\n"
        "except OSError: print('ro')\n"
    )
    assert r.exit_code == 0, r.stderr
    assert r.stdout.split() == ["65534", "no-net", "ro"]

    slow = await DockerSandbox(runtime=None, limits=Limits(timeout_s=2)).python("import time; time.sleep(30)")
    assert slow.timed_out and slow.exit_code == -1
