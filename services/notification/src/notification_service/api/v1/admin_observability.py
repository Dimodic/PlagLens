"""Section J: deliveries / DLQ / stats (admin)."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.db import get_db
from notification_service.delivery import _deliver_one, _persist_delivery
from notification_service.errors import Problem
from notification_service.models import Notification, NotificationDelivery, NotificationPreference
from notification_service.pagination import decode_cursor, encode_cursor
from notification_service.schemas import DeliveryOut, Page, Pagination, StatsOut
from notification_service.security import Principal, require_admin

router = APIRouter(tags=["admin-observability"])


@router.get("/admin/notifications/deliveries", response_model=Page)
async def list_deliveries(
    status: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = select(NotificationDelivery)
    if status:
        stmt = stmt.where(NotificationDelivery.status == status)
    if channel:
        stmt = stmt.where(NotificationDelivery.channel == channel)
    cur = decode_cursor(cursor)
    if cur:
        stmt = stmt.where(NotificationDelivery.id > cur.get("id", ""))
    stmt = stmt.order_by(NotificationDelivery.attempted_at.desc()).limit(limit + 1)
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor = (
        encode_cursor(page_rows[-1].id, page_rows[-1].id) if has_more and page_rows else None
    )
    return {
        "data": [DeliveryOut.model_validate(d).model_dump() for d in page_rows],
        "pagination": Pagination(next_cursor=next_cursor, has_more=has_more, limit=limit).model_dump(),
    }


@router.get("/admin/notifications/dlq", response_model=Page)
async def list_dlq(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = select(NotificationDelivery).where(NotificationDelivery.status == "failed")
    cur = decode_cursor(cursor)
    if cur:
        stmt = stmt.where(NotificationDelivery.id > cur.get("id", ""))
    stmt = stmt.order_by(NotificationDelivery.attempted_at.desc()).limit(limit + 1)
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor = (
        encode_cursor(page_rows[-1].id, page_rows[-1].id) if has_more and page_rows else None
    )
    return {
        "data": [DeliveryOut.model_validate(d).model_dump() for d in page_rows],
        "pagination": Pagination(next_cursor=next_cursor, has_more=has_more, limit=limit).model_dump(),
    }


@router.post("/admin/notifications/dlq/{delivery_id}:retry", response_model=DeliveryOut)
async def retry_delivery(
    delivery_id: str,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DeliveryOut:
    d = await db.get(NotificationDelivery, delivery_id)
    if d is None:
        raise Problem(404, "NOT_FOUND", "Delivery not found")
    if d.status != "failed":
        raise Problem(409, "CONFLICT", "Delivery is not failed")
    n = await db.get(Notification, d.notification_id)
    if n is None:
        raise Problem(404, "NOT_FOUND", "Notification gone")
    pref = await db.get(NotificationPreference, n.user_id)
    result = await _deliver_one(db, n, d.channel, pref)
    new = await _persist_delivery(db, n, d.channel, result)
    new.retry_count = (d.retry_count or 0) + 1
    return DeliveryOut.model_validate(new)


@router.post("/admin/notifications/dlq/{delivery_id}:discard", response_model=DeliveryOut)
async def discard_delivery(
    delivery_id: str,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DeliveryOut:
    d = await db.get(NotificationDelivery, delivery_id)
    if d is None:
        raise Problem(404, "NOT_FOUND", "Delivery not found")
    d.status = "discarded"
    d.error = "discarded by admin"
    return DeliveryOut.model_validate(d)


@router.get("/admin/notifications/stats", response_model=StatsOut)
async def stats(
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> StatsOut:
    stmt = select(
        NotificationDelivery.channel,
        NotificationDelivery.status,
        func.count(),
    ).group_by(NotificationDelivery.channel, NotificationDelivery.status)
    res = await db.execute(stmt)
    by_channel: dict[str, dict[str, int]] = defaultdict(dict)
    total = 0
    for ch, st, cnt in res.all():
        by_channel[ch][st] = int(cnt)
        total += int(cnt)
    rate: dict[str, float] = {}
    for ch, statuses in by_channel.items():
        all_n = sum(statuses.values())
        ok = statuses.get("sent", 0) + statuses.get("delivered", 0)
        rate[ch] = (ok / all_n) if all_n else 0.0
    return StatsOut(
        period="all-time",
        by_channel=dict(by_channel),
        delivery_rate=rate,
        total=total,
    )


_ = datetime  # noqa: F841
_ = timezone  # noqa: F841
