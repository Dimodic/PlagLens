"""APScheduler wiring: monthly partition pre-create + daily retention cleaner."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from ..common.logging import get_logger
from ..config import settings
from ..repositories.retention import LegalHoldRepository, RetentionPolicyRepository
from .partitions import ensure_next_month_partition
from .retention import run_retention

log = get_logger("audit.scheduler")


class AuditScheduler:
    """Thin wrapper around APScheduler so we can no-op cleanly in tests."""

    def __init__(self, engine: AsyncEngine, session_factory: async_sessionmaker) -> None:
        self._engine = engine
        self._session_factory = session_factory
        self._scheduler = None

    async def start(self) -> None:
        if settings.scheduler_disabled:
            log.info("audit.scheduler.disabled")
            return
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore
            from apscheduler.triggers.cron import CronTrigger  # type: ignore
        except Exception as exc:  # noqa: BLE001
            log.warning("audit.scheduler.apscheduler_unavailable", error=str(exc))
            return

        self._scheduler = AsyncIOScheduler(timezone="UTC")

        self._scheduler.add_job(
            self.partition_job,
            CronTrigger(day=settings.partition_cron_day, hour=2, minute=0),
            name="audit-partition-manager",
            replace_existing=True,
            id="audit-partition-manager",
        )
        self._scheduler.add_job(
            self.retention_job,
            CronTrigger(hour=settings.retention_cron_hour, minute=0),
            name="audit-retention-cleaner",
            replace_existing=True,
            id="audit-retention-cleaner",
        )
        self._scheduler.start()
        log.info("audit.scheduler.started")

    async def stop(self) -> None:
        if self._scheduler is not None:
            try:
                self._scheduler.shutdown(wait=False)
            except Exception:  # noqa: BLE001
                pass
        log.info("audit.scheduler.stopped")

    async def partition_job(self) -> None:
        try:
            name = await ensure_next_month_partition(self._engine)
            log.info("audit.scheduler.partition_ensured", partition=name)
        except Exception as exc:  # noqa: BLE001
            log.error("audit.scheduler.partition_failed", error=str(exc))

    async def retention_job(self) -> None:
        try:
            async with self._session_factory() as session:
                policy_repo = RetentionPolicyRepository(session)
                hold_repo = LegalHoldRepository(session)
                legal_ids = await hold_repo.list_active_resource_ids(tenant_id=None)
                # Use system default retention.
                days = settings.retention_default_days
                _ = policy_repo  # reserved for per-tenant retention extension
                from .retention import run_retention as _run

                result = await _run(
                    self._engine,
                    session,
                    legal_hold_resource_ids=legal_ids,
                    days=days,
                    dry_run=False,
                )
                log.info(
                    "audit.scheduler.retention_run",
                    dropped=len(result.dropped),
                    blocked=len(result.blocked_by_legal_hold),
                    when=datetime.now(UTC).isoformat(),
                )
        except Exception as exc:  # noqa: BLE001
            log.error("audit.scheduler.retention_failed", error=str(exc))


# Re-export for type completeness in tests.
__all__ = ["AuditScheduler", "run_retention"]
