"""Section B: SSE stream."""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from notification_service.config import get_settings
from notification_service.db import get_db
from notification_service.metrics import sse_active_connections
from notification_service.models import Notification
from notification_service.redis_bus import get_redis, sse_channel
from notification_service.security import Principal, get_principal

router = APIRouter(tags=["stream"])


async def _replay_since(
    db: AsyncSession, user_id: str, last_seq: int
) -> list[Notification]:
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id, Notification.seq > last_seq)
        .order_by(Notification.seq.asc())
        .limit(100)
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


def _format_event(n: Notification) -> dict[str, object]:
    payload = {
        "id": n.id,
        "event_type": n.event_type,
        "title": n.title,
        "body": n.body,
        "action_url": n.action_url,
        "severity": n.severity,
        "metadata": dict(n.metadata_ or {}),
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "seq": n.seq,
    }
    return {
        "event": "notification",
        "id": str(n.seq),
        "data": json.dumps(payload, ensure_ascii=False),
        "retry": 5000,
    }


@router.get("/notifications/stream")
async def stream(
    request: Request,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> EventSourceResponse:
    settings = get_settings()
    user_id = principal.user_id
    tenant_id = principal.tenant_id or "tnt_unknown"
    sse_active_connections.labels(tenant_id=tenant_id).inc()

    last_seq = 0
    if last_event_id and last_event_id.isdigit():
        last_seq = int(last_event_id)

    redis = get_redis()
    pubsub = redis.pubsub(ignore_subscribe_messages=True)
    await pubsub.subscribe(sse_channel(user_id))

    async def gen() -> AsyncIterator[dict[str, object]]:
        try:
            # Always yield an initial "ready" comment so clients see the
            # connection is alive within milliseconds (and tests don't have to
            # wait for the heartbeat). This is also important behind nginx /
            # CDNs that buffer until the first byte.
            yield {
                "event": "ready",
                "data": json.dumps(
                    {"ts": datetime.now(UTC).isoformat(), "user_id": user_id}
                ),
                "retry": 5000,
            }
            # Initial replay from DB if Last-Event-ID provided
            if last_seq > 0:
                missed = await _replay_since(db, user_id, last_seq)
                for n in missed:
                    yield _format_event(n)
            heartbeat_interval = settings.SSE_HEARTBEAT_SECONDS
            last_heartbeat = asyncio.get_event_loop().time()
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                except Exception:
                    msg = None
                if msg and msg.get("type") == "message":
                    data_raw = msg.get("data")
                    if isinstance(data_raw, bytes):
                        data_raw = data_raw.decode("utf-8", errors="replace")
                    yield {
                        "event": "notification",
                        "data": data_raw if isinstance(data_raw, str) else "",
                        "retry": 5000,
                    }
                now = asyncio.get_event_loop().time()
                if now - last_heartbeat >= heartbeat_interval:
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps(
                            {"ts": datetime.now(UTC).isoformat()}
                        ),
                    }
                    last_heartbeat = now
        finally:
            try:
                await pubsub.close()
            except Exception:
                pass
            sse_active_connections.labels(tenant_id=tenant_id).dec()

    return EventSourceResponse(gen(), ping=15)
