"""Quiet hours helpers (timezone-aware)."""
from __future__ import annotations

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from notification_service.models import NotificationPreference


def _parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    try:
        h, m = value.split(":")
        return time(int(h), int(m))
    except Exception:
        return None


def _safe_tz(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def is_in_quiet_hours(
    pref: NotificationPreference, *, now: datetime | None = None
) -> bool:
    start = _parse_hhmm(pref.quiet_hours_start)
    end = _parse_hhmm(pref.quiet_hours_end)
    if start is None or end is None:
        return False
    tz = _safe_tz(pref.timezone or "UTC")
    if now is None:
        now = datetime.now(tz=tz)
    else:
        now = now.astimezone(tz)
    cur = now.time()
    if start == end:
        return False
    if start < end:
        return start <= cur < end
    # Wraps midnight, e.g. 22:00 .. 07:00
    return cur >= start or cur < end


def end_of_quiet_window(
    pref: NotificationPreference, *, now: datetime | None = None
) -> datetime | None:
    start = _parse_hhmm(pref.quiet_hours_start)
    end = _parse_hhmm(pref.quiet_hours_end)
    if start is None or end is None:
        return None
    tz = _safe_tz(pref.timezone or "UTC")
    if now is None:
        now = datetime.now(tz=tz)
    else:
        now = now.astimezone(tz)
    today_end = now.replace(
        hour=end.hour, minute=end.minute, second=0, microsecond=0
    )
    if start < end:
        if now.time() < end:
            return today_end
        return today_end + timedelta(days=1)
    # wrap around midnight
    if now.time() >= start:
        return today_end + timedelta(days=1)
    if now.time() < end:
        return today_end
    return today_end + timedelta(days=1)
