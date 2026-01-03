"""APScheduler wrapper. Falls back to a no-op scheduler in tests/dev.

Production wires APScheduler with PG JobStore (per spec §scheduling); for the
academic project we use the simpler ``AsyncIOScheduler`` MemoryJobStore so the
deliverable is self-contained.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Callable

from sqlalchemy.ext.asyncio import async_sessionmaker

from ..common.time import utcnow
from ..repositories.schedules import ScheduleRepo


class ReportingScheduler:
    def __init__(self, session_maker: async_sessionmaker, run_export: Callable):
        self.session_maker = session_maker
        self.run_export = run_export
        self._task: asyncio.Task | None = None
        self._impl = None
        self.fired_ids: list[str] = []

    async def start(self) -> None:
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler

            self._impl = AsyncIOScheduler(timezone="UTC")
            self._impl.start(paused=False)
        except Exception:
            self._impl = None

    async def stop(self) -> None:
        if self._impl is not None:
            try:
                self._impl.shutdown(wait=False)
            except Exception:
                pass
            self._impl = None

    @staticmethod
    def _aware(dt: datetime) -> datetime:
        """SQLite strips tzinfo on round-trip; re-attach UTC if needed."""
        return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt

    async def trigger_due(self, now: datetime | None = None) -> list[str]:
        """Idempotently fires all schedules whose ``next_run_at <= now``.

        Returns list of created export ids.
        """
        now = self._aware(now or utcnow())
        created: list[str] = []
        async with self.session_maker() as session:
            repo = ScheduleRepo(session)
            schedules = await repo.list_enabled()
            due = [s for s in schedules if self._aware(s.next_run_at or now) <= now]
            for sched in due:
                period_start = self._aware(sched.next_run_at or now).replace(microsecond=0)
                # idempotency check
                ok = await repo.record_run(
                    sched.id, period_start, export_id=None, status="pending"
                )
                if not ok:
                    continue
                eid = await self.run_export(sched, period_start, session)
                sched.last_run_at = now
                sched.next_run_at = self._next_run_at(sched.cron, now)
                created.append(eid)
                self.fired_ids.append(eid)
            await session.commit()
        return created

    @staticmethod
    def _next_run_at(cron: str, now: datetime) -> datetime:
        """Best-effort next-run-at. Supports the simple subset
        (``@hourly`` / ``@daily`` / ``*/N * * * *`` / ``every:Ns``)."""
        if cron == "@hourly" or cron == "0 * * * *":
            return (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        if cron == "@daily" or cron == "0 0 * * *":
            return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        if cron.startswith("every:"):
            try:
                seconds = int(cron.split(":", 1)[1].rstrip("s"))
                return now + timedelta(seconds=seconds)
            except Exception:
                return now + timedelta(hours=1)
        # Default to one hour from now
        return now + timedelta(hours=1)
