"""Digest aggregation: APScheduler periodic jobs.

For each user with `email_digest_frequency != instant`, gather unread
notifications since their last digest mark and email a single digest.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.channels import DeliveryRequest
from notification_service.db import session_scope
from notification_service.delivery import get_channels
from notification_service.logging import get_logger
from notification_service.metrics import digest_runs_total
from notification_service.models import Notification, NotificationPreference

log = get_logger("digest")


async def collect_for_user(
    session: AsyncSession, user_id: str, since: datetime
) -> list[Notification]:
    stmt = (
        select(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.created_at >= since,
            Notification.read_at.is_(None),
            Notification.archived_at.is_(None),
        )
        .order_by(Notification.created_at.asc())
        .limit(500)
    )
    res = await session.execute(stmt)
    return list(res.scalars().all())


def render_digest_body(notifications: list[Notification]) -> tuple[str, str]:
    if not notifications:
        return "Дайджест PlagLens (пусто)", "Нет новых уведомлений за период."
    lines = [f"У вас {len(notifications)} новых уведомлений:"]
    for n in notifications[:50]:
        lines.append(f"- [{n.severity}] {n.title}")
    return f"Дайджест PlagLens ({len(notifications)})", "\n".join(lines)


async def run_digest(frequency: str) -> int:
    """Run digest for a frequency window. Returns number of emails sent."""
    if frequency == "hourly":
        window = timedelta(hours=1)
    elif frequency == "daily":
        window = timedelta(days=1)
    else:
        return 0
    since = datetime.now(UTC) - window
    sent = 0
    async with session_scope() as session:
        stmt = select(NotificationPreference).where(
            NotificationPreference.email_digest_frequency == frequency,
            NotificationPreference.email_disabled.is_(False),
        )
        res = await session.execute(stmt)
        users = list(res.scalars().all())
        channels = get_channels()
        for pref in users:
            notifs = await collect_for_user(session, pref.user_id, since)
            if not notifs or not pref.email:
                continue
            subject, body = render_digest_body(notifs)
            req = DeliveryRequest(
                notification_id="digest",
                user_id=pref.user_id,
                tenant_id=pref.tenant_id,
                title=subject,
                body=body,
                recipient_email=pref.email,
            )
            try:
                result = await channels.email.send(req)
                if result.status in ("sent", "delivered"):
                    sent += 1
            except Exception as e:  # noqa: BLE001
                log.warning("digest_send_failed", user_id=pref.user_id, error=str(e))
    digest_runs_total.labels(frequency=frequency).inc()
    return sent


async def preview_digest(user_id: str) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(hours=24)
    async with session_scope() as session:
        notifs = await collect_for_user(session, user_id, since)
    return {
        "user_id": user_id,
        "period_hours": 24,
        "count": len(notifs),
        "notifications": notifs,
    }


def setup_scheduler() -> Any | None:
    """Wire APScheduler hourly + daily jobs. Returns the scheduler (or None)."""
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore
    except Exception:
        return None
    sched = AsyncIOScheduler(timezone="UTC")
    sched.add_job(_hourly_job, "interval", hours=1, id="digest-hourly")
    sched.add_job(_daily_job, "interval", days=1, id="digest-daily")
    return sched


async def _hourly_job() -> None:
    try:
        await run_digest("hourly")
    except Exception as e:  # noqa: BLE001
        log.warning("hourly_digest_failed", error=str(e))


async def _daily_job() -> None:
    try:
        await run_digest("daily")
    except Exception as e:  # noqa: BLE001
        log.warning("daily_digest_failed", error=str(e))
