"""Repository for ``SuspiciousFlag``."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.plagiarism import SuspiciousFlag


class SuspiciousRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, flag: SuspiciousFlag) -> SuspiciousFlag:
        self.session.add(flag)
        await self.session.flush()
        return flag

    async def get(self, flag_id: str) -> SuspiciousFlag | None:
        return await self.session.get(SuspiciousFlag, flag_id)

    async def list_for_submission(
        self, *, submission_id: str, tenant_id: str
    ) -> list[SuspiciousFlag]:
        stmt = select(SuspiciousFlag).where(
            SuspiciousFlag.submission_id == submission_id,
            SuspiciousFlag.tenant_id == tenant_id,
        ).order_by(SuspiciousFlag.created_at.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_active_by_assignment(
        self,
        *,
        tenant_id: str,
        submission_ids: list[str],
        limit: int = 200,
    ) -> list[SuspiciousFlag]:
        if not submission_ids:
            return []
        stmt = (
            select(SuspiciousFlag)
            .where(
                SuspiciousFlag.tenant_id == tenant_id,
                SuspiciousFlag.submission_id.in_(submission_ids),
                SuspiciousFlag.cleared_at.is_(None),
            )
            .order_by(SuspiciousFlag.created_at.desc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_active(self, *, tenant_id: str, limit: int = 200) -> list[SuspiciousFlag]:
        stmt = (
            select(SuspiciousFlag)
            .where(
                SuspiciousFlag.tenant_id == tenant_id,
                SuspiciousFlag.cleared_at.is_(None),
            )
            .order_by(SuspiciousFlag.created_at.desc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def clear(self, flag_id: str, *, cleared_by: str) -> SuspiciousFlag | None:
        flag = await self.session.get(SuspiciousFlag, flag_id)
        if flag is None or flag.cleared_at is not None:
            return None
        flag.cleared_at = datetime.now(UTC)
        flag.cleared_by = cleared_by
        await self.session.flush()
        return flag

    async def dismiss(
        self, flag_id: str, *, cleared_by: str, reason: str
    ) -> SuspiciousFlag | None:
        flag = await self.session.get(SuspiciousFlag, flag_id)
        if flag is None or flag.cleared_at is not None:
            return None
        flag.cleared_at = datetime.now(UTC)
        flag.cleared_by = cleared_by
        flag.dismiss_reason = reason
        await self.session.flush()
        return flag
