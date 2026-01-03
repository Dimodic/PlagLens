"""ExportJob repository."""
from __future__ import annotations

from typing import Any

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.pagination import Page, PageInfo, decode_cursor, encode_cursor
from ..models.reporting import ExportJob


class ExportJobRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, job: ExportJob) -> ExportJob:
        self.session.add(job)
        await self.session.flush()
        return job

    async def get(self, tenant_id: str, export_id: str, include_deleted: bool = False) -> ExportJob | None:
        obj = await self.session.get(ExportJob, export_id)
        if obj is None or obj.tenant_id != tenant_id:
            return None
        if not include_deleted and obj.deleted_at is not None:
            return None
        return obj

    async def list(
        self,
        tenant_id: str,
        *,
        triggered_by: str | None = None,
        course_id: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> Page[ExportJob]:
        cur = decode_cursor(cursor)
        stmt = select(ExportJob).where(ExportJob.tenant_id == tenant_id)
        stmt = stmt.where(ExportJob.deleted_at.is_(None))
        if triggered_by:
            stmt = stmt.where(ExportJob.triggered_by == triggered_by)
        if kind:
            stmt = stmt.where(ExportJob.kind == kind)
        if status:
            stmt = stmt.where(ExportJob.status == status)
        if course_id:
            stmt = stmt.where(ExportJob.scope.contains({"course_id": course_id}))
        if cur:
            ts = cur.get("ts")
            jid = cur.get("id")
            if ts and jid:
                from datetime import datetime

                stmt = stmt.where(
                    and_(
                        ExportJob.created_at <= datetime.fromisoformat(ts.replace("Z", "+00:00")),
                        ExportJob.id < jid,
                    )
                )
        stmt = stmt.order_by(desc(ExportJob.created_at), desc(ExportJob.id)).limit(limit + 1)
        rows = list((await self.session.execute(stmt)).scalars().all())
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = None
        if has_more and rows:
            last = rows[-1]
            next_cursor = encode_cursor({"ts": last.created_at.isoformat(), "id": last.id})
        return Page(
            data=rows,
            pagination=PageInfo(next_cursor=next_cursor, has_more=has_more, limit=limit),
        )

    async def update(self, job: ExportJob, **fields: Any) -> ExportJob:
        for k, v in fields.items():
            setattr(job, k, v)
        await self.session.flush()
        return job

    async def soft_delete(self, job: ExportJob) -> None:
        from ..common.time import utcnow

        job.deleted_at = utcnow()
        await self.session.flush()

    async def expired_artifacts(self, before) -> list[ExportJob]:
        stmt = select(ExportJob).where(
            ExportJob.expiry_at.is_not(None),
            ExportJob.expiry_at < before,
            ExportJob.artifact_uri.is_not(None),
        )
        return list((await self.session.execute(stmt)).scalars().all())
