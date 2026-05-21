"""Retention cleaner: drop partitions older than retention_class days,
unless any LegalHold protects a resource_id present in that partition.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from ..common.logging import get_logger
from ..config import settings
from ..models import SCHEMA, AuditEvent
from .partitions import drop_partition_sql, list_existing_partitions

log = get_logger("audit.retention")


@dataclass
class RetentionResult:
    candidate_partitions: list[str]
    blocked_by_legal_hold: list[str]
    dropped: list[str]


def _parse_partition_month(name: str) -> date | None:
    parts = name.split("_")
    if len(parts) < 4:
        return None
    try:
        year = int(parts[-2])
        month = int(parts[-1])
        return date(year, month, 1)
    except ValueError:
        return None


def cutoff_date(*, days: int, now: datetime | None = None) -> date:
    now = now or datetime.now(UTC)
    return (now - timedelta(days=days)).date()


def select_candidates(
    partitions: list[str],
    *,
    cutoff: date,
) -> list[str]:
    """A partition is a candidate if its end-of-month is before cutoff."""
    out: list[str] = []
    for name in partitions:
        month = _parse_partition_month(name)
        if month is None:
            continue
        # End of partition = start of next month.
        if month.month == 12:
            end = date(month.year + 1, 1, 1)
        else:
            end = date(month.year, month.month + 1, 1)
        if end <= cutoff:
            out.append(name)
    return out


async def _resource_ids_in_partition(
    session: AsyncSession, partition_name: str
) -> set[str]:
    """Distinct resource_ids in a partition. SQLite fallback uses the parent."""
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        sql = text(
            f'SELECT DISTINCT resource_id FROM "{SCHEMA}"."{partition_name}" '
            "WHERE resource_id IS NOT NULL"
        )
        rows = (await session.execute(sql)).all()
        return {r[0] for r in rows if r[0]}
    # Non-PG (tests): use the parent table & no real partitioning.
    rows = (
        await session.execute(
            select(AuditEvent.resource_id).where(AuditEvent.resource_id.is_not(None))
        )
    ).scalars().all()
    return {r for r in rows if r}


async def run_retention(
    engine: AsyncEngine,
    session: AsyncSession,
    *,
    legal_hold_resource_ids: set[str],
    days: int | None = None,
    dry_run: bool = True,
) -> RetentionResult:
    """Drop expired partitions; respect legal holds.

    On non-PostgreSQL backends this is a no-op (returns empty result), since
    partitioning DDL is PG-only.
    """
    days = days if days is not None else settings.retention_default_days
    partitions = await list_existing_partitions(session)
    candidates = select_candidates(partitions, cutoff=cutoff_date(days=days))

    blocked: list[str] = []
    droppable: list[str] = []
    for part in candidates:
        ids_in_partition = await _resource_ids_in_partition(session, part)
        if ids_in_partition & legal_hold_resource_ids:
            blocked.append(part)
        else:
            droppable.append(part)

    dropped: list[str] = []
    if not dry_run:
        async with engine.begin() as conn:
            if conn.dialect.name != "postgresql":
                log.info("audit.retention.skip_non_pg")
            else:
                for part in droppable:
                    await conn.execute(text(drop_partition_sql(part)))
                    dropped.append(part)

    log.info(
        "audit.retention.run",
        days=days,
        dry_run=dry_run,
        candidates=len(candidates),
        blocked=len(blocked),
        dropped=len(dropped),
    )
    return RetentionResult(
        candidate_partitions=candidates,
        blocked_by_legal_hold=blocked,
        dropped=dropped,
    )
