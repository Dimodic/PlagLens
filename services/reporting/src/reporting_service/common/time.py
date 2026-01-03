"""Time helpers: always UTC."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta


def utcnow() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def in_days(days: int) -> datetime:
    return utcnow() + timedelta(days=days)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat().replace("+00:00", "Z")
