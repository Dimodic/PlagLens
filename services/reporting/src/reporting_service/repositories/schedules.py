"""ScheduledExport repository."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.reporting import ScheduledExport, ScheduledExportRun


class ScheduleRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, sched: ScheduledExport) -> ScheduledExport:
        self.session.add(sched)
        await self.session.flush()
        return sched

    async def get(self, tenant_id: str, schedule_id: str) -> ScheduledExport | None:
        obj = await self.session.get(ScheduledExport, schedule_id)
        if obj is None or obj.tenant_id != tenant_id or obj.deleted_at is not None:
            return None
        return obj

    async def list_for_course(self, tenant_id: str, course_id: str) -> list[ScheduledExport]:
        stmt = select(ScheduledExport).where(
            ScheduledExport.tenant_id == tenant_id,
            ScheduledExport.course_id == course_id,
            ScheduledExport.deleted_at.is_(None),
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_enabled(self) -> list[ScheduledExport]:
        stmt = select(ScheduledExport).where(
            ScheduledExport.deleted_at.is_(None), ScheduledExport.enabled.is_(True)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def update(self, sched: ScheduledExport, **fields: Any) -> ScheduledExport:
        for k, v in fields.items():
            setattr(sched, k, v)
        await self.session.flush()
        return sched

    async def soft_delete(self, sched: ScheduledExport) -> None:
        from ..common.time import utcnow

        sched.deleted_at = utcnow()
        sched.enabled = False
        await self.session.flush()

    async def record_run(
        self, schedule_id: str, period_start, *, export_id: str | None, status: str
    ) -> bool:
        """Returns True if recorded, False if already existed (idempotent)."""
        stmt = select(ScheduledExportRun).where(
            ScheduledExportRun.schedule_id == schedule_id,
            ScheduledExportRun.period_start == period_start,
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            return False
        self.session.add(
            ScheduledExportRun(
                schedule_id=schedule_id,
                period_start=period_start,
                export_id=export_id,
                status=status,
            )
        )
        await self.session.flush()
        return True
