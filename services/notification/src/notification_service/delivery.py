"""Delivery worker: assemble Notification + Delivery rows, fan out to channels.

Quiet hours: for email/telegram we still create a `pending` Delivery row and
schedule it via a Redis ZSET keyed by epoch-end-of-window. A periodic job
('quiet_hours_dispatcher' below) flushes due rows. Tests can call
`flush_quiet_hours_now` to drain immediately.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.channels import (
    Channel,
    DeliveryRequest,
    DeliveryResult,
    InAppChannel,
    TelegramChannel,
    build_email_channel,
)
from notification_service.config import get_settings
from notification_service.ids import delivery_id, notification_id
from notification_service.metrics import (
    notifications_created_total,
    notifications_delivered_total,
)
from notification_service.models import (
    Notification,
    NotificationDelivery,
    NotificationPreference,
)
from notification_service.quiet_hours import end_of_quiet_window, is_in_quiet_hours
from notification_service.redis_bus import get_redis
from notification_service.routers.rule_engine import Recipient, resolve_recipients
from notification_service.templates_engine import render


@dataclass
class _ChannelRegistry:
    inapp: Channel
    email: Channel
    telegram: Channel


_registry: _ChannelRegistry | None = None


def init_channels(
    *,
    inapp: Channel | None = None,
    email: Channel | None = None,
    telegram: Channel | None = None,
) -> None:
    global _registry
    _registry = _ChannelRegistry(
        inapp=inapp or InAppChannel(),
        email=email or build_email_channel(),
        telegram=telegram or TelegramChannel(),
    )


async def reset_email_channel(new_channel: Channel | None = None) -> None:
    """Replace the email channel (used after admin PATCH email-config)."""
    global _registry
    if _registry is None:
        init_channels()
        assert _registry is not None
    try:
        await _registry.email.close()
    except Exception:
        pass
    _registry.email = new_channel or build_email_channel()


def get_channels() -> _ChannelRegistry:
    if _registry is None:
        init_channels()
    assert _registry is not None
    return _registry


async def close_channels() -> None:
    global _registry
    if _registry is None:
        return
    for ch in (_registry.inapp, _registry.email, _registry.telegram):
        try:
            await ch.close()
        except Exception:
            pass
    _registry = None


async def create_notification(
    session: AsyncSession,
    *,
    user_id: str,
    tenant_id: str,
    event_type: str,
    title: str,
    body: str,
    action_url: str | None = None,
    severity: str = "info",
    metadata: dict[str, Any] | None = None,
    event_id: str | None = None,
    source: str | None = None,
) -> Notification:
    n = Notification(
        id=notification_id(),
        tenant_id=tenant_id,
        user_id=user_id,
        event_id=event_id,
        event_type=event_type,
        source=source,
        title=title,
        body=body,
        action_url=action_url,
        severity=severity,
        metadata_=dict(metadata or {}),
        channels_attempted={},
    )
    session.add(n)
    await session.flush()
    notifications_created_total.labels(event_type=event_type).inc()
    return n


async def _deliver_one(
    session: AsyncSession,
    notification: Notification,
    channel: str,
    pref: NotificationPreference | None,
) -> DeliveryResult:
    reg = get_channels()
    chan_obj: Channel
    if channel == "inapp":
        chan_obj = reg.inapp
    elif channel == "email":
        chan_obj = reg.email
    elif channel == "telegram":
        chan_obj = reg.telegram
    else:
        return DeliveryResult(status="skipped", error="unknown channel")

    req = DeliveryRequest(
        notification_id=notification.id,
        user_id=notification.user_id,
        tenant_id=notification.tenant_id,
        title=notification.title,
        body=notification.body,
        action_url=notification.action_url,
        severity=notification.severity,
        metadata=dict(notification.metadata_ or {}),
        recipient_email=(pref.email if pref else None),
        recipient_telegram_chat_id=(pref.telegram_chat_id if pref else None),
    )
    return await chan_obj.send(req)


async def _persist_delivery(
    session: AsyncSession,
    notification: Notification,
    channel: str,
    result: DeliveryResult,
) -> NotificationDelivery:
    d = NotificationDelivery(
        id=delivery_id(),
        notification_id=notification.id,
        channel=channel,
        status=result.status,
        error=result.error,
        delivered_at=datetime.now(UTC) if result.status in ("sent", "delivered") else None,
        retry_count=0,
    )
    session.add(d)
    summary = dict(notification.channels_attempted or {})
    summary[channel] = result.status
    notification.channels_attempted = summary
    notifications_delivered_total.labels(channel=channel, status=result.status).inc()
    await session.flush()
    return d


async def _enqueue_quiet(
    notification_id_: str, channel: str, when_epoch: float
) -> None:
    redis = get_redis()
    settings = get_settings()
    key = settings.QUIET_HOURS_QUEUE_KEY
    member = json.dumps({"n": notification_id_, "c": channel}, ensure_ascii=False)
    try:
        await redis.zadd(key, {member: when_epoch})
    except Exception:
        pass


async def deliver_notification(
    session: AsyncSession,
    notification: Notification,
    *,
    channels: list[str],
    pref: NotificationPreference | None,
) -> dict[str, DeliveryResult]:
    out: dict[str, DeliveryResult] = {}
    deferred = (
        is_in_quiet_hours(pref) if pref is not None and channels else False
    )
    end_window = end_of_quiet_window(pref) if (deferred and pref is not None) else None
    for ch in channels:
        if deferred and ch in ("email", "telegram") and end_window is not None:
            placeholder = DeliveryResult(status="pending", error="deferred-quiet-hours")
            await _persist_delivery(session, notification, ch, placeholder)
            await _enqueue_quiet(notification.id, ch, end_window.timestamp())
            out[ch] = placeholder
            continue
        result = await _deliver_one(session, notification, ch, pref)
        await _persist_delivery(session, notification, ch, result)
        out[ch] = result
    return out


async def fanout_event(
    session: AsyncSession,
    event: dict[str, Any],
    *,
    extra_user_ids: list[str] | None = None,
) -> list[Notification]:
    event_type = str(event.get("type", ""))
    if not event_type:
        return []
    recipients: list[Recipient] = await resolve_recipients(
        session, event, extra_user_ids=extra_user_ids
    )
    if not recipients:
        return []
    created: list[Notification] = []
    data = event.get("data") or {}
    metadata = {k: v for k, v in data.items() if not isinstance(v, dict | list) or k == "metadata"}
    for rec in recipients:
        locale = (rec.pref.locale if rec.pref else "ru") or "ru"
        subject, body = await render(
            session,
            event_type=event_type,
            channel="email" if "email" in rec.channels else "inapp",
            locale=locale,
            data={**data, "user_id": rec.user_id},
        )
        title = subject or event_type
        action_url = data.get("action_url") or data.get("url")
        n = await create_notification(
            session,
            user_id=rec.user_id,
            tenant_id=rec.tenant_id,
            event_type=event_type,
            title=title,
            body=body,
            action_url=action_url,
            severity=str(data.get("severity") or "info"),
            metadata=metadata,
            event_id=str(event.get("id") or ""),
            source=str(event.get("source") or ""),
        )
        await deliver_notification(
            session, n, channels=rec.channels, pref=rec.pref
        )
        created.append(n)
    return created


async def flush_quiet_hours_now(session: AsyncSession) -> int:
    """Drain due deferred rows from Redis ZSET and attempt delivery."""
    redis = get_redis()
    settings = get_settings()
    now = time.time()
    try:
        members = await redis.zrangebyscore(settings.QUIET_HOURS_QUEUE_KEY, 0, now)
    except Exception:
        return 0
    sent = 0
    for raw in members:
        try:
            payload = json.loads(raw)
        except Exception:
            await redis.zrem(settings.QUIET_HOURS_QUEUE_KEY, raw)
            continue
        nid = payload.get("n")
        ch = payload.get("c")
        if not nid or not ch:
            await redis.zrem(settings.QUIET_HOURS_QUEUE_KEY, raw)
            continue
        n = await session.get(Notification, nid)
        if n is None:
            await redis.zrem(settings.QUIET_HOURS_QUEUE_KEY, raw)
            continue
        # find pref
        pref = await session.get(NotificationPreference, n.user_id)
        result = await _deliver_one(session, n, ch, pref)
        await _persist_delivery(session, n, ch, result)
        await redis.zrem(settings.QUIET_HOURS_QUEUE_KEY, raw)
        sent += 1
    return sent
