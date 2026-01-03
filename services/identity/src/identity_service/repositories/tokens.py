"""Password-reset and email-verify token repositories."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import EmailVerifyToken, PasswordResetToken


class PasswordResetTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get_by_hash(self, token_hash: str) -> PasswordResetToken | None:
        stmt = select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def add(self, token: PasswordResetToken) -> PasswordResetToken:
        self.s.add(token)
        await self.s.flush()
        return token

    async def mark_used(self, token_id: str) -> None:
        await self.s.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.id == token_id)
            .values(used_at=datetime.now(timezone.utc))
        )


class EmailVerifyTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get_by_hash(self, token_hash: str) -> EmailVerifyToken | None:
        stmt = select(EmailVerifyToken).where(
            EmailVerifyToken.token_hash == token_hash,
            EmailVerifyToken.used_at.is_(None),
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def add(self, token: EmailVerifyToken) -> EmailVerifyToken:
        self.s.add(token)
        await self.s.flush()
        return token

    async def mark_used(self, token_id: str) -> None:
        await self.s.execute(
            update(EmailVerifyToken)
            .where(EmailVerifyToken.id == token_id)
            .values(used_at=datetime.now(timezone.utc))
        )
