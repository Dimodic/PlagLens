"""ImportJob repository."""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.models import ImportJob


class ImportJobRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, job: ImportJob) -> ImportJob:
        self.session.add(job)
        await self.session.flush()
        return job

    async def get(self, job_id: str, tenant_id: Optional[str] = None) -> Optional[ImportJob]:
        stmt = select(ImportJob).where(ImportJob.id == job_id)
        if tenant_id is not None:
            stmt = stmt.where(ImportJob.tenant_id == tenant_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_for_config(
        self, integration_id: str, tenant_id: str, limit: int = 50
    ) -> List[ImportJob]:
        stmt = (
            select(ImportJob)
            .where(
                ImportJob.integration_id == integration_id,
                ImportJob.tenant_id == tenant_id,
            )
            .order_by(ImportJob.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def count_active_for_tenant(self, tenant_id: str) -> int:
        stmt = select(ImportJob).where(
            ImportJob.tenant_id == tenant_id,
            ImportJob.status.in_(("queued", "running")),
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return len(list(rows))

    async def list_failed_for_tenant(self, tenant_id: str, limit: int = 50) -> List[ImportJob]:
        stmt = (
            select(ImportJob)
            .where(ImportJob.tenant_id == tenant_id, ImportJob.status == "failed")
            .order_by(ImportJob.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars().all())
