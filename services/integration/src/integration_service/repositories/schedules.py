"""SyncSchedule repository."""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.models import SyncSchedule


class SyncScheduleRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, sch: SyncSchedule) -> SyncSchedule:
        self.session.add(sch)
        await self.session.flush()
        return sch

    async def get(
        self, schedule_id: str, integration_id: Optional[str] = None
    ) -> Optional[SyncSchedule]:
        stmt = select(SyncSchedule).where(SyncSchedule.id == schedule_id)
        if integration_id is not None:
            stmt = stmt.where(SyncSchedule.integration_id == integration_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_for_config(self, integration_id: str) -> List[SyncSchedule]:
        stmt = (
            select(SyncSchedule)
            .where(SyncSchedule.integration_id == integration_id)
            .order_by(SyncSchedule.created_at.desc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_due(self, now) -> List[SyncSchedule]:  # type: ignore[no-untyped-def]
        stmt = (
            select(SyncSchedule)
            .where(SyncSchedule.enabled.is_(True), SyncSchedule.next_run_at <= now)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def delete(self, sch: SyncSchedule) -> None:
        await self.session.delete(sch)
        await self.session.flush()
