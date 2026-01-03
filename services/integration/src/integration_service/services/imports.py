"""Import / sync orchestration."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters import get_adapter
from integration_service.common.ids import new_job_id
from integration_service.common.kafka_bus import KafkaBus
from integration_service.config import get_settings
from integration_service.models import ImportJob, IntegrationConfig
from integration_service.repositories import ImportJobRepo

logger = structlog.get_logger(__name__)


async def enqueue_import(
    session: AsyncSession,
    config: IntegrationConfig,
    scope: dict[str, Any],
    trigger: str,
    bus: Optional[KafkaBus] = None,
) -> ImportJob:
    """Create the ``ImportJob`` row in ``queued`` state and emit
    ``integration.import.started.v1``. Real workers pick it up later."""
    s = get_settings()
    repo = ImportJobRepo(session)
    active = await repo.count_active_for_tenant(config.tenant_id)
    if active >= s.max_concurrent_imports_per_tenant:
        # Backpressure — still enqueue but mark as queued; consumers honour the cap.
        logger.warning(
            "integration.import.backpressure",
            tenant_id=config.tenant_id,
            active=active,
        )
    job = ImportJob(
        id=new_job_id(),
        integration_id=config.id,
        tenant_id=config.tenant_id,
        scope=scope or {},
        trigger=trigger,
        status="queued",
        progress={"completed": 0, "total": 0, "percent": 0.0},
        stats={"imported": 0, "skipped": 0, "failed": 0},
    )
    await repo.add(job)
    if bus is not None:
        await bus.publish(
            s.kafka_topic_integration_import,
            "integration.import.started.v1",
            {
                "job_id": job.id,
                "integration_id": config.id,
                "kind": config.kind,
                "scope": job.scope,
                "trigger": trigger,
            },
            tenant_id=config.tenant_id,
            subject=f"integration:{config.id}",
        )
    return job


async def run_import_inline(
    session: AsyncSession,
    config: IntegrationConfig,
    job: ImportJob,
    bus: Optional[KafkaBus] = None,
) -> ImportJob:
    """Synchronously drive the adapter through one import pass and update the
    job. Production worker would call this from a background task."""
    s = get_settings()
    job.status = "running"
    job.started_at = datetime.now(UTC)
    await session.flush()
    adapter = get_adapter(config.kind)
    since: Optional[datetime] = None
    raw_since = (job.scope or {}).get("since")
    if isinstance(raw_since, str):
        try:
            since = datetime.fromisoformat(raw_since.replace("Z", "+00:00"))
        except ValueError:
            since = None
    try:
        result = await adapter.import_submissions(config, job.scope or {}, since)
        job.stats = {
            "imported": result.imported,
            "skipped": result.skipped,
            "failed": result.failed,
            "errors": list(result.errors)[:20],
        }
        if result.cursor:
            cursor = dict(config.cursor or {})
            cursor.update(result.cursor)
            config.cursor = cursor
        job.status = "completed" if result.failed == 0 else "failed"
        job.error = None if result.failed == 0 else {"errors": result.errors[:5]}
        config.last_sync_at = datetime.now(UTC)
        config.last_sync_status = job.status
        config.last_sync_error = None if result.failed == 0 else "; ".join(result.errors[:3])
    except Exception as exc:
        job.status = "failed"
        job.error = {"detail": str(exc)}
        config.last_sync_status = "failed"
        config.last_sync_error = str(exc)
    finally:
        job.finished_at = datetime.now(UTC)
        await session.flush()
    if bus is not None:
        topic = s.kafka_topic_integration_import
        if job.status == "completed":
            await bus.publish(
                topic,
                "integration.import.completed.v1",
                {"job_id": job.id, "stats": job.stats},
                tenant_id=config.tenant_id,
                subject=f"integration:{config.id}",
            )
        else:
            await bus.publish(
                topic,
                "integration.import.failed.v1",
                {"job_id": job.id, "error": job.error},
                tenant_id=config.tenant_id,
                subject=f"integration:{config.id}",
            )
    return job
