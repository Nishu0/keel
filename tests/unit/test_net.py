from __future__ import annotations

import socket

import httpx
import httpx2
import pytest

from keel.security import net
from keel.security.net import BlockedAddress, check_url, guard, is_public
from keel.tools.builtin import web_fetch


@pytest.fixture(autouse=True)
def guard_on(monkeypatch):
    monkeypatch.delenv("KEEL_ALLOW_PRIVATE_NETWORK", raising=False)


@pytest.mark.parametrize(
    "ip,ok",
    [
        ("8.8.8.8", True),
        ("2001:4860:4860::8888", True),
        ("10.0.0.1", False),
        ("172.16.5.4", False),
        ("192.168.1.1", False),
        ("127.0.0.1", False),
        ("169.254.169.254", False),  # cloud metadata
        ("100.64.0.1", False),  # carrier nat
        ("0.0.0.0", False),
        ("::1", False),
        ("fd00::1", False),
        ("fe80::1%eth0", False),
        ("::ffff:10.0.0.1", False),  # v4 mapped
        ("224.0.0.1", False),
    ],
)
def test_is_public(ip, ok):
    assert is_public(ip) is ok


async def test_web_fetch_refuses_metadata_and_localhost():
    out = await web_fetch("http://169.254.169.254/latest/meta-data/")
    assert "private address" in out["error"]
    out = await web_fetch("http://localhost:8000/")
    assert "private address" in out["error"]


def fake_dns(monkeypatch, table: dict[str, list[str]]):
    async def getaddrinfo(host, port, **kw):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in table[host]]

    monkeypatch.setattr(net.anyio, "getaddrinfo", getaddrinfo)


async def test_a_public_name_that_resolves_private_is_refused(monkeypatch):
    fake_dns(monkeypatch, {"sneaky.example": ["93.184.216.34", "10.0.0.7"]})
    with pytest.raises(BlockedAddress, match="10.0.0.7"):
        await check_url("https://sneaky.example/hook")


class Recorder:
    def __init__(self):
        self.hosts = []

    async def connect_tcp(self, host, port, **kw):
        self.hosts.append(host)
        raise OSError("not really connecting")


async def test_the_guard_connects_to_the_address_it_checked(monkeypatch):
    fake_dns(monkeypatch, {"ok.example": ["93.184.216.34"], "bad.example": ["192.168.0.2"]})
    inner = Recorder()
    backend = net._GuardedBackend(inner)
    with pytest.raises(OSError):
        await backend.connect_tcp("ok.example", 443)
    assert inner.hosts == ["93.184.216.34"]  # the ip, so a second dns answer can't swap it
    with pytest.raises(BlockedAddress):
        await backend.connect_tcp("bad.example", 443)
    assert inner.hosts == ["93.184.216.34"]


async def test_redirects_to_private_addresses_are_refused():
    # every hop opens a new connection through the guard; here the first hop already fails
    async with net.safe_client(follow_redirects=True) as c:
        with pytest.raises(BlockedAddress):
            await c.get("http://127.0.0.1:9/")


def test_both_http_stacks_still_expose_the_backend_we_wrap():
    # guard() reaches into private attributes; this fails loudly if an upgrade moves them
    for t in (httpx.AsyncHTTPTransport(), httpx2.AsyncHTTPTransport()):
        assert isinstance(guard(t)._pool._network_backend, net._GuardedBackend)


async def test_dev_override(monkeypatch):
    monkeypatch.setenv("KEEL_ALLOW_PRIVATE_NETWORK", "1")
    await check_url("http://localhost:3000/hook")  # no error
