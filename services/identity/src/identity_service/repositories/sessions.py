"""Session repository (refresh tokens)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Session


class SessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get(self, session_id: str) -> Session | None:
        return await self.s.get(Session, session_id)

    async def get_by_token_hash(self, token_hash: str) -> Session | None:
        stmt = select(Session).where(
            Session.refresh_token_hash == token_hash,
            Session.revoked_at.is_(None),
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def list_for_user(self, user_id: str) -> list[Session]:
        stmt = (
            select(Session)
            .where(Session.user_id == user_id)
            .order_by(Session.last_used_at.desc())
        )
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, session_obj: Session) -> Session:
        self.s.add(session_obj)
        await self.s.flush()
        return session_obj

    async def revoke(self, session_id: str) -> None:
        # TODO: emit identity.session.revoked.v1
        stmt = (
            update(Session)
            .where(Session.id == session_id, Session.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await self.s.execute(stmt)

    async def revoke_all_for_user(
        self, user_id: str, except_session_id: str | None = None
    ) -> int:
        stmt = update(Session).where(
            Session.user_id == user_id, Session.revoked_at.is_(None)
        )
        if except_session_id:
            stmt = stmt.where(Session.id != except_session_id)
        stmt = stmt.values(revoked_at=datetime.now(timezone.utc))
        result = await self.s.execute(stmt)
        return result.rowcount or 0
