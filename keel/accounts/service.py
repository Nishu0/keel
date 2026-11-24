"""What signing in, inviting and issuing keys actually do."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import timedelta

from keel.accounts.models import ApiKey, Identity, Invite, MagicLink, Membership, Org, Role, Session, User
from keel.accounts.store import AccountStore, token_hash
from keel.core.events import utcnow
from keel.core.ids import new_id

SESSION_TTL = timedelta(days=30)
INVITE_TTL = timedelta(days=7)
MAGIC_LINK_TTL = timedelta(minutes=15)
KEY_PREFIX_LEN = 12


class AuthError(Exception):
    pass


@dataclass
class SignedIn:
    user: User
    org_id: str
    new_user: bool


class Accounts:
    def __init__(self, store: AccountStore) -> None:
        self.store = store

    # ---------- sign in ----------

    async def sign_in(
        self, provider: str, subject: str, email: str, name: str = "", avatar_url: str | None = None
    ) -> SignedIn:
        """Find or create the person behind an identity. Emails link identities, so the same
        person signing in with GitHub and then Google lands in the same account."""
        email = email.strip()
        if not email or "@" not in email:
            raise AuthError("the provider didn't share a verified email")
        identity = Identity(provider=provider, subject=subject)
        user = await self.store.user_by_identity(provider, subject)
        new_user = False
        if user is None:
            user = await self.store.user_by_email(email)
            if user is not None:
                await self.store.add_identity(user.id, identity)
            else:
                user = await self.store.create_user(
                    User(
                        id=new_id("usr"),
                        email=email,
                        name=name or email.split("@")[0],
                        avatar_url=avatar_url,
                        identities=[identity],
                    )
                )
                new_user = True

        orgs = await self.store.orgs_for_user(user.id)
        if orgs:
            org_id = orgs[0].org_id
        else:
            # everyone gets their own org on the free plan to start in
            org = await self.store.create_org(Org(id=new_id("org"), name=f"{user.name}'s org"))
            await self.store.set_member(Membership(org_id=org.id, user_id=user.id, role=Role.OWNER))
            org_id = org.id
        return SignedIn(user=user, org_id=org_id, new_user=new_user)

    async def start_session(self, user_id: str, org_id: str) -> str:
        token = secrets.token_urlsafe(32)
        await self.store.create_session(
            Session(id=token_hash(token), user_id=user_id, org_id=org_id, expires_at=utcnow() + SESSION_TTL)
        )
        return token

    async def session(self, token: str) -> Session | None:
        return await self.store.get_session(token_hash(token))

    async def end_session(self, token: str) -> None:
        await self.store.delete_session(token_hash(token))

    async def switch_org(self, token: str, user_id: str, org_id: str) -> None:
        if await self.store.get_member(org_id, user_id) is None:
            raise AuthError("not a member of that org")
        await self.store.set_session_org(token_hash(token), org_id)

    # ---------- magic links ----------

    async def magic_link(self, email: str) -> str:
        token = secrets.token_urlsafe(32)
        await self.store.create_magic_link(
            MagicLink(id=token_hash(token), email=email.strip(), expires_at=utcnow() + MAGIC_LINK_TTL)
        )
        return token

    async def use_magic_link(self, token: str) -> SignedIn:
        link = await self.store.use_magic_link(token_hash(token))
        if link is None:
            raise AuthError("that sign in link has expired or was already used")
        return await self.sign_in("email", link.email.lower(), link.email)

    # ---------- api keys ----------

    async def create_key(self, org_id: str, name: str, role: Role, by: str) -> tuple[str, ApiKey]:
        """Returns the secret once. Only its hash and prefix are stored."""
        secret = "kl_live_" + secrets.token_urlsafe(30).replace("-", "a").replace("_", "b")
        key = ApiKey(
            id=new_id("key"),
            org_id=org_id,
            name=name,
            prefix=secret[:KEY_PREFIX_LEN],
            hash=token_hash(secret),
            role=role,
            created_by=by,
        )
        await self.store.create_key(key)
        return secret, key

    async def verify_key(self, secret: str) -> ApiKey | None:
        key = await self.store.key_by_prefix(secret[:KEY_PREFIX_LEN])
        if key is None or key.revoked_at or not secrets.compare_digest(key.hash, token_hash(secret)):
            return None
        await self.store.touch_key(key.id)
        return key

    # ---------- invites ----------

    async def invite(self, org_id: str, email: str, role: Role, by: str) -> str:
        if role is Role.OWNER:
            raise AuthError("invite as admin, then transfer ownership")
        token = secrets.token_urlsafe(32)
        await self.store.create_invite(
            Invite(
                id=token_hash(token),
                org_id=org_id,
                email=email.strip(),
                role=role,
                invited_by=by,
                expires_at=utcnow() + INVITE_TTL,
            )
        )
        return token

    async def accept_invite(self, token: str, user: User) -> str:
        inv = await self.store.get_invite(token_hash(token))
        if inv is None or inv.accepted_at or inv.expires_at <= utcnow():
            raise AuthError("that invite has expired or was already used")
        if inv.email.lower() != user.email.lower():
            raise AuthError(f"this invite is for {inv.email}. Sign in with that address to accept it.")
        if await self.store.get_member(inv.org_id, user.id) is None:
            await self.store.set_member(Membership(org_id=inv.org_id, user_id=user.id, role=inv.role))
        await self.store.accept_invite(inv.id)
        return inv.org_id
