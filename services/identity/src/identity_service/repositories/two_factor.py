"""Two-factor secret repository."""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import TwoFactorSecret


class TwoFactorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get(self, user_id: str) -> TwoFactorSecret | None:
        stmt = select(TwoFactorSecret).where(TwoFactorSecret.user_id == user_id)
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def upsert(self, secret: TwoFactorSecret) -> TwoFactorSecret:
        existing = await self.get(secret.user_id)
        if existing is not None:
            existing.secret_encrypted = secret.secret_encrypted
            existing.backup_codes = secret.backup_codes
            existing.enabled_at = secret.enabled_at
            await self.s.flush()
            return existing
        self.s.add(secret)
        await self.s.flush()
        return secret

    async def delete(self, user_id: str) -> None:
        await self.s.execute(
            delete(TwoFactorSecret).where(TwoFactorSecret.user_id == user_id)
        )
