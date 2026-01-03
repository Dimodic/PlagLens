"""OAuth identity repository."""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import OAuthIdentity


class OAuthIdentityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get_by_provider_subject(
        self, provider: str, provider_user_id: str
    ) -> OAuthIdentity | None:
        stmt = select(OAuthIdentity).where(
            OAuthIdentity.provider == provider,
            OAuthIdentity.provider_user_id == provider_user_id,
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def list_for_user(self, user_id: str) -> list[OAuthIdentity]:
        stmt = select(OAuthIdentity).where(OAuthIdentity.user_id == user_id)
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, identity: OAuthIdentity) -> OAuthIdentity:
        self.s.add(identity)
        await self.s.flush()
        return identity

    async def unlink(self, user_id: str, provider: str) -> int:
        result = await self.s.execute(
            delete(OAuthIdentity).where(
                OAuthIdentity.user_id == user_id,
                OAuthIdentity.provider == provider,
            )
        )
        return result.rowcount or 0
