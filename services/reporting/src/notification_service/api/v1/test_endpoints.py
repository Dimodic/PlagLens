"""Section D: test (debug) endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.api.v1.preferences import _get_or_create_pref
from notification_service.db import get_db
from notification_service.delivery import (
    create_notification,
    deliver_notification,
)
from notification_service.models import NotificationPreference
from notification_service.schemas import TestBroadcastBody, TestSendBody
from notification_service.security import Principal, get_principal, require_admin

router = APIRouter(tags=["test"])


@router.post("/users/me/notifications/test")
async def send_test(
    body: TestSendBody,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    pref = await _get_or_create_pref(db, principal.user_id, principal.tenant_id)
    notif = await create_notification(
        db,
        user_id=principal.user_id,
        tenant_id=principal.tenant_id,
        event_type="test",
        title=body.title or "Тестовое уведомление",
        body=body.body or "Это тест.",
        severity="info",
    )
    results = await deliver_notification(
        db, notif, channels=[body.channel], pref=pref
    )
    return {
        "notification_id": notif.id,
        "channels": {ch: r.status for ch, r in results.items()},
    }


@router.post("/admin/notifications/test-broadcast")
async def test_broadcast(
    body: TestBroadcastBody,
    principal: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    stmt = select(NotificationPreference).where(
        NotificationPreference.tenant_id == principal.tenant_id
    )
    res = await db.execute(stmt)
    prefs = list(res.scalars().all())
    sent = 0
    for pref in prefs:
        notif = await create_notification(
            db,
            user_id=pref.user_id,
            tenant_id=pref.tenant_id,
            event_type="test",
            title=body.title,
            body=body.body,
        )
        await deliver_notification(db, notif, channels=["inapp"], pref=pref)
        sent += 1
    return {"sent": sent}
