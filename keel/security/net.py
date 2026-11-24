"""Outbound requests that can't reach private networks (SSRF protection).

Agents choose the urls that web_fetch, webhooks and MCP servers call, so a run could
be pointed at http://169.254.169.254 (cloud credentials) or a database on the private
network. Checking the url string isn't enough: a public name can resolve to a private
address, or redirect to one. So the check lives where the socket is opened. Every
connection, including each redirect hop, resolves the name, refuses unless every
address is public, then connects to the address it checked, never re-resolving.

Set KEEL_ALLOW_PRIVATE_NETWORK=1 to turn this off for local development.
"""

from __future__ import annotations

import ipaddress
import os
import socket
from typing import Any
from urllib.parse import urlsplit

import anyio


class BlockedAddress(Exception):
    """The destination isn't on the public internet."""


def allow_private() -> bool:
    return os.environ.get("KEEL_ALLOW_PRIVATE_NETWORK") == "1"


def is_public(ip: str) -> bool:
    addr = ipaddress.ip_address(ip.split("%", 1)[0])  # drop an ipv6 zone id
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped  # ::ffff:10.0.0.1 is 10.0.0.1
    return addr.is_global and not addr.is_multicast


async def resolve_public(host: str, port: int) -> list[str]:
    """The host's addresses, or BlockedAddress if any of them isn't public."""
    try:
        ipaddress.ip_address(host.strip("[]"))
        ips = [host.strip("[]")]
    except ValueError:
        try:
            infos = await anyio.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except socket.gaierror as e:
            raise BlockedAddress(f"can't resolve {host}") from e
        ips = list(dict.fromkeys(str(i[4][0]) for i in infos))
    if not ips:
        raise BlockedAddress(f"{host} has no addresses")
    if not allow_private():
        bad = [ip for ip in ips if not is_public(ip)]
        if bad:
            # refuse if any address is private, so round robin dns can't slip one through
            raise BlockedAddress(
                f"{host} resolves to a private address ({bad[0]}); only public hosts are allowed"
            )
    return ips


async def check_url(url: str) -> None:
    """Fail fast with a clear message when a url is saved (the connect-time guard still applies)."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise BlockedAddress("only http and https urls are allowed")
    if allow_private():
        return
    await resolve_public(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80))


class _GuardedBackend:
    """Wraps httpcore's (or httpcore2's) network backend. Only connect_tcp changes."""

    def __init__(self, inner: Any) -> None:
        self._inner = inner

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Any = None,
    ) -> Any:
        ips = await resolve_public(host, port)
        last: Exception | None = None
        for ip in ips:
            try:
                # tls still verifies against the original hostname: httpcore passes it as sni separately
                return await self._inner.connect_tcp(
                    ip, port, timeout=timeout, local_address=local_address, socket_options=socket_options
                )
            except OSError as e:
                last = e
        raise last or BlockedAddress(f"couldn't connect to {host}")

    async def connect_unix_socket(self, *a: Any, **kw: Any) -> Any:
        raise BlockedAddress("unix sockets are not allowed")

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)


def guard(transport: Any) -> Any:
    """Make an httpx / httpx2 AsyncHTTPTransport refuse private destinations. Returns it."""
    pool = transport._pool  # private, so tests/unit/test_net.py pins this against upgrades
    pool._network_backend = _GuardedBackend(pool._network_backend)
    return transport


def safe_client(**kw: Any) -> Any:
    """An httpx.AsyncClient for urls that agents or users control."""
    import httpx

    # trust_env off: an environment proxy would sit between us and the check
    return httpx.AsyncClient(
        transport=guard(httpx.AsyncHTTPTransport(trust_env=False)), trust_env=False, **kw
    )
