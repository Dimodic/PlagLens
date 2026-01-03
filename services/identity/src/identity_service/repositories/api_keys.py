"""API key repository."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ApiKey


class ApiKeyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get(self, key_id: str) -> ApiKey | None:
        return await self.s.get(ApiKey, key_id)

    async def list_for_owner(self, owner_user_id: str) -> list[ApiKey]:
        stmt = (
            select(ApiKey)
            .where(ApiKey.owner_user_id == owner_user_id)
            .order_by(ApiKey.created_at.desc())
        )
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, api_key: ApiKey) -> ApiKey:
        self.s.add(api_key)
        await self.s.flush()
        return api_key

    async def revoke(self, key_id: str) -> None:
        await self.s.execute(
            update(ApiKey)
            .where(ApiKey.id == key_id, ApiKey.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )

    async def get_by_hash(self, key_hash: str) -> ApiKey | None:
        stmt = select(ApiKey).where(
            ApiKey.key_hash == key_hash, ApiKey.revoked_at.is_(None)
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()
