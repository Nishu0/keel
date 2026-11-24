"""Encrypting org secrets at rest.

Each org gets its own data key, derived from the master key with HKDF and the
org id, so one org's key never decrypts another's secrets. Secrets are sealed
with AES-GCM, and the org id plus secret name are bound in as associated data:
a ciphertext copied to another org or renamed fails to open.

Hosted deployments swap the master key for AWS KMS (generate and unwrap a data
key per org); the Sealer interface stays the same.
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


class SecretsNotConfigured(RuntimeError):
    pass


class Sealer:
    def __init__(self, master_key: bytes) -> None:
        if len(master_key) < 32:
            raise ValueError("master key must be at least 32 bytes")
        self._master = master_key

    @classmethod
    def from_env(cls) -> Sealer:
        raw = os.environ.get("KEEL_MASTER_KEY", "")
        if not raw:
            raise SecretsNotConfigured("set KEEL_MASTER_KEY (openssl rand -base64 32) to store secrets")
        return cls(base64.b64decode(raw))

    def _org_key(self, org_id: str) -> bytes:
        return HKDF(
            algorithm=hashes.SHA256(), length=32, salt=b"keel.secrets.v1", info=org_id.encode()
        ).derive(self._master)

    def seal(self, org_id: str, name: str, value: str) -> tuple[str, str]:
        nonce = os.urandom(12)
        ct = AESGCM(self._org_key(org_id)).encrypt(nonce, value.encode(), f"{org_id}:{name}".encode())
        return base64.b64encode(ct).decode(), base64.b64encode(nonce).decode()

    def open(self, org_id: str, name: str, ciphertext: str, nonce: str) -> str:
        pt = AESGCM(self._org_key(org_id)).decrypt(
            base64.b64decode(nonce), base64.b64decode(ciphertext), f"{org_id}:{name}".encode()
        )
        return pt.decode()
