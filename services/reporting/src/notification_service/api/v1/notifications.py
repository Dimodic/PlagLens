"""Section A: notifications read/list/mark-read."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.db import get_db
from notification_service.errors import Problem
from notification_service.models import Notification
from notification_service.pagination import decode_cursor, encode_cursor
from notification_service.schemas import (
    IdsBody,
    NotificationOut,
    NotificationPatch,
    Page,
    Pagination,
    UnreadCountOut,
)
from notification_service.security import Principal, get_principal

router = APIRouter(tags=["notifications"])


def _to_out(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=n.id,
        tenant_id=n.tenant_id,
        user_id=n.user_id,
        event_id=n.event_id,
        event_type=n.event_type,
        source=n.source,
        title=n.title,
        body=n.body,
        action_url=n.action_url,
        severity=n.severity,  # type: ignore[arg-type]
        metadata_=dict(n.metadata_ or {}),
        channels_attempted=dict(n.channels_attempted or {}),
        created_at=n.created_at,
        read_at=n.read_at,
        archived_at=n.archived_at,
        seq=n.seq,
    )


@router.get("/notifications", response_model=Page)
async def list_notifications(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    sort: str = Query(default="-created_at"),
    unread: bool | None = Query(default=None),
    severity: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    event_type: str | None = Query(default=None),
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> Any:
    desc = sort.startswith("-")

    stmt = select(Notification).where(
        Notification.user_id == principal.user_id,
        Notification.archived_at.is_(None),
    )
    if unread is True:
        stmt = stmt.where(Notification.read_at.is_(None))
    elif unread is False:
        stmt = stmt.where(Notification.read_at.is_not(None))
    if severity:
        stmt = stmt.where(Notification.severity == severity)
    if since:
        stmt = stmt.where(Notification.created_at >= since)
    if event_type:
        stmt = stmt.where(Notification.event_type == event_type)

    cur = decode_cursor(cursor)
    if cur:
        try:
            seq_val = int(cur["s"])
        except Exception:
            seq_val = 0
        if desc:
            stmt = stmt.where(Notification.seq < seq_val)
        else:
            stmt = stmt.where(Notification.seq > seq_val)

    if desc:
        stmt = stmt.order_by(Notification.seq.desc())
    else:
        stmt = stmt.order_by(Notification.seq.asc())
    stmt = stmt.limit(limit + 1)

    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor = (
        encode_cursor(page_rows[-1].seq, page_rows[-1].id) if has_more and page_rows else None
    )
    return {
        "data": [_to_out(n).model_dump() for n in page_rows],
        "pagination": Pagination(
            next_cursor=next_cursor, has_more=has_more, limit=limit
        ).model_dump(),
    }


@router.get("/notifications/unread-count", response_model=UnreadCountOut)
async def unread_count(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> UnreadCountOut:
    stmt = select(func.count()).select_from(Notification).where(
        Notification.user_id == principal.user_id,
        Notification.read_at.is_(None),
        Notification.archived_at.is_(None),
    )
    res = await db.execute(stmt)
    return UnreadCountOut(unread=int(res.scalar() or 0))


@router.get("/notifications/{notif_id}", response_model=NotificationOut)
async def get_notification(
    notif_id: str,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> NotificationOut:
    n = await db.get(Notification, notif_id)
    if n is None or n.user_id != principal.user_id:
        raise Problem(404, "NOT_FOUND", "Notification not found")
    return _to_out(n)


@router.patch("/notifications/{notif_id}", response_model=NotificationOut)
async def patch_notification(
    notif_id: str,
    body: NotificationPatch,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> NotificationOut:
    n = await db.get(Notification, notif_id)
    if n is None or n.user_id != principal.user_id:
        raise Problem(404, "NOT_FOUND", "Notification not found")
    if body.read is True and n.read_at is None:
        n.read_at = datetime.now(UTC)
    elif body.read is False:
        n.read_at = None
    if body.archived is True and n.archived_at is None:
        n.archived_at = datetime.now(UTC)
    elif body.archived is False:
        n.archived_at = None
    return _to_out(n)


@router.post("/notifications:markAllRead")
async def mark_all_read(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    stmt = select(Notification).where(
        Notification.user_id == principal.user_id,
        Notification.read_at.is_(None),
        Notification.archived_at.is_(None),
    )
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    now = datetime.now(UTC)
    for n in rows:
        n.read_at = now
    return {"updated": len(rows)}


@router.post("/notifications:markRead")
async def mark_read(
    body: IdsBody,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    return await _bulk_mark(db, principal.user_id, body.ids, read=True)


@router.post("/notifications:markUnread")
async def mark_unread(
    body: IdsBody,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    return await _bulk_mark(db, principal.user_id, body.ids, read=False)


async def _bulk_mark(
    db: AsyncSession, user_id: str, ids: list[str], *, read: bool
) -> dict[str, int]:
    stmt = select(Notification).where(
        Notification.user_id == user_id, Notification.id.in_(ids)
    )
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    now = datetime.now(UTC)
    for n in rows:
        n.read_at = now if read else None
    return {"updated": len(rows)}


@router.delete("/notifications/{notif_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notif_id: str,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> None:
    n = await db.get(Notification, notif_id)
    if n is None or n.user_id != principal.user_id:
        raise Problem(404, "NOT_FOUND", "Notification not found")
    if n.archived_at is None:
        n.archived_at = datetime.now(UTC)
    return None
