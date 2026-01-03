"""Daily cleanup task: drops MinIO artifacts whose ExportJob.expiry_at is past."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from ..common.time import utcnow
from ..models.reporting import ProcessedEvent
from ..repositories.export_jobs import ExportJobRepo


async def run_cleanup(
    session_maker: async_sessionmaker,
    storage,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or utcnow()
    deleted = 0
    expired_ids: list[str] = []
    async with session_maker() as session:
        repo = ExportJobRepo(session)
        expired = await repo.expired_artifacts(now)
        for job in expired:
            if not job.artifact_uri:
                continue
            uri = job.artifact_uri.removeprefix("s3://")
            bucket, _, key = uri.partition("/")
            ok = await storage.delete(bucket, key)
            if ok:
                job.artifact_uri = None
                deleted += 1
                expired_ids.append(job.id)
        # cleanup stale processed-events (>7d)
        from datetime import timedelta

        from sqlalchemy import delete

        cutoff = now - timedelta(days=7)
        await session.execute(delete(ProcessedEvent).where(ProcessedEvent.consumed_at < cutoff))
        await session.commit()
    return {"deleted_artifacts": deleted, "expired_export_ids": expired_ids}
