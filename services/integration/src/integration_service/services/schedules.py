"""Schedule management — APScheduler wrapper + manual run-now helper."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable, Optional

import structlog
from croniter import croniter
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.config import get_settings
from integration_service.models import SyncSchedule
from integration_service.repositories import SyncScheduleRepo

logger = structlog.get_logger(__name__)

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore
    from apscheduler.triggers.cron import CronTrigger  # type: ignore

    APSCHEDULER_AVAILABLE = True
except Exception:  # pragma: no cover
    AsyncIOScheduler = None  # type: ignore
    CronTrigger = None  # type: ignore
    APSCHEDULER_AVAILABLE = False


def compute_next_run_at(cron: str, base: Optional[datetime] = None) -> Optional[datetime]:
    base = base or datetime.now(UTC)
    try:
        itr = croniter(cron, base)
        nxt = itr.get_next(datetime)
        if nxt.tzinfo is None:
            nxt = nxt.replace(tzinfo=UTC)
        return nxt
    except Exception as exc:
        logger.warning("schedule.cron.invalid", cron=cron, error=str(exc))
        return None


async def update_next_run_at(
    session: AsyncSession, schedule: SyncSchedule, *, base: Optional[datetime] = None
) -> SyncSchedule:
    schedule.next_run_at = compute_next_run_at(schedule.cron, base=base)
    await session.flush()
    return schedule


class ScheduleRunner:
    """Light AsyncIOScheduler wrapper. ``register_callback`` is called every
    time a cron triggers and receives the schedule's ``id``."""

    def __init__(self) -> None:
        self.scheduler: Any = None
        self._callback: Optional[Callable[[str], Awaitable[None]]] = None
        self._jobs: dict[str, Any] = {}

    def register_callback(self, cb: Callable[[str], Awaitable[None]]) -> None:
        self._callback = cb

    async def start(self) -> None:
        if not APSCHEDULER_AVAILABLE:
            logger.warning("scheduler.apscheduler_unavailable")
            return
        if not get_settings().enable_scheduler:
            logger.info("scheduler.disabled")
            return
        self.scheduler = AsyncIOScheduler(timezone="UTC")  # type: ignore[misc]
        self.scheduler.start()

    async def stop(self) -> None:
        if self.scheduler is not None:
            try:
                self.scheduler.shutdown(wait=False)
            except Exception:
                pass

    def add(self, schedule: SyncSchedule) -> None:
        if self.scheduler is None or not self._callback:
            return

        async def _wrap() -> None:
            assert self._callback is not None
            try:
                await self._callback(schedule.id)
            except Exception as exc:
                logger.exception("schedule.callback.failed", error=str(exc))

        try:
            trigger = CronTrigger.from_crontab(schedule.cron)  # type: ignore[union-attr]
        except Exception as exc:
            logger.warning("schedule.cron.invalid", cron=schedule.cron, error=str(exc))
            return
        if schedule.id in self._jobs:
            try:
                self._jobs[schedule.id].remove()
            except Exception:
                pass
        job = self.scheduler.add_job(
            lambda: asyncio.create_task(_wrap()),
            trigger=trigger,
            id=schedule.id,
            replace_existing=True,
        )
        self._jobs[schedule.id] = job

    def remove(self, schedule_id: str) -> None:
        if self.scheduler is None:
            return
        try:
            self.scheduler.remove_job(schedule_id)
        except Exception:
            pass
        self._jobs.pop(schedule_id, None)


_runner: Optional[ScheduleRunner] = None


def get_runner() -> ScheduleRunner:
    global _runner
    if _runner is None:
        _runner = ScheduleRunner()
    return _runner


async def reset_runner_for_tests() -> None:
    global _runner
    if _runner is not None:
        await _runner.stop()
    _runner = None


async def hydrate_runner(
    session: AsyncSession, runner: Optional[ScheduleRunner] = None
) -> int:
    """Read enabled schedules from DB and register them with the runner."""
    runner = runner or get_runner()
    repo = SyncScheduleRepo(session)
    schedules: list[SyncSchedule] = []
    # ``list_due`` requires a timestamp; we list all enabled by setting now=infty.
    # Cheap workaround: query all enabled schedules.
    from sqlalchemy import select

    rows = (
        await session.execute(
            select(SyncSchedule).where(SyncSchedule.enabled.is_(True))
        )
    ).scalars().all()
    schedules = list(rows)
    for sch in schedules:
        runner.add(sch)
    _ = repo
    return len(schedules)
