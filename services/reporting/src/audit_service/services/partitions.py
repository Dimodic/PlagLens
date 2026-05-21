"""Partition management for ``audit.audit_events``.

PostgreSQL only. Generates DDL for monthly RANGE partitions.
"""
from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from ..common.logging import get_logger
from ..models import SCHEMA

log = get_logger("audit.partitions")


def _month_range(d: date) -> tuple[date, date]:
    """Return [start, next_month_start) for the month containing ``d``."""
    start = d.replace(day=1)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def partition_name(d: date) -> str:
    return f"audit_events_{d.year:04d}_{d.month:02d}"


def create_partition_sql(d: date) -> str:
    start, end = _month_range(d)
    name = partition_name(d)
    return (
        f'CREATE TABLE IF NOT EXISTS "{SCHEMA}"."{name}" '
        f'PARTITION OF "{SCHEMA}"."audit_events" '
        f"FOR VALUES FROM ('{start.isoformat()}') TO ('{end.isoformat()}');"
    )


def drop_partition_sql(name: str) -> str:
    return f'DROP TABLE IF EXISTS "{SCHEMA}"."{name}";'


def months_for_year(year: int) -> Iterable[date]:
    return (date(year, m, 1) for m in range(1, 13))


async def ensure_partition(engine_or_session: AsyncEngine | AsyncSession, d: date) -> None:
    """Create partition for the month of ``d`` (idempotent). PG only."""
    sql = create_partition_sql(d)
    if isinstance(engine_or_session, AsyncSession):
        await engine_or_session.execute(text(sql))
        return
    async with engine_or_session.begin() as conn:
        if conn.dialect.name != "postgresql":
            log.info("audit.partitions.skip_non_pg", dialect=conn.dialect.name)
            return
        await conn.execute(text(sql))


async def ensure_next_month_partition(engine: AsyncEngine) -> str | None:
    """Pre-create next-month partition. Returns the partition name or None."""
    today = datetime.now(UTC).date()
    nxt = (today.replace(day=28) + timedelta(days=10)).replace(day=1)
    async with engine.begin() as conn:
        if conn.dialect.name != "postgresql":
            return None
        await conn.execute(text(create_partition_sql(nxt)))
    return partition_name(nxt)


async def list_existing_partitions(session: AsyncSession) -> list[str]:
    """Names of existing audit_events_* partitions."""
    if session.bind is None or getattr(session.bind, "dialect", None) is None:
        return []
    if session.bind.dialect.name != "postgresql":
        return []
    rows = await session.execute(
        text(
            "SELECT inhrelid::regclass::text AS child_name "
            "FROM pg_inherits "
            "WHERE inhparent = '\"audit\".\"audit_events\"'::regclass"
        )
    )
    return [r[0].split(".")[-1].strip('"') for r in rows.all()]
