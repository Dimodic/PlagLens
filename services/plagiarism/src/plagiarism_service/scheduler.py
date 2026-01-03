"""APScheduler wiring for active-run polling."""
from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .common.logging import get_logger
from .config import settings
from .services.orchestrator import Orchestrator

log = get_logger(__name__)


def build_scheduler(orchestrator: Orchestrator) -> AsyncIOScheduler:
    sched = AsyncIOScheduler(timezone="UTC")

    async def _tick() -> None:
        try:
            handled = await orchestrator.poll_active_runs()
            if handled:
                log.debug("poll_tick", handled=handled)
        except Exception as exc:  # noqa: BLE001
            log.error("poll_tick_failed", error=str(exc))

    sched.add_job(
        _tick,
        "interval",
        seconds=settings.poll_interval_seconds,
        id="poll_active_runs",
        replace_existing=True,
        max_instances=1,
    )
    return sched
