"""Section H: digest endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from notification_service.digest import preview_digest, run_digest
from notification_service.schemas import DigestPreviewOut, NotificationOut
from notification_service.security import Principal, get_principal, require_admin

router = APIRouter(tags=["digest"])


@router.post("/admin/notifications/digest:trigger-now")
async def digest_trigger(
    frequency: str = Query(default="daily", pattern="^(hourly|daily)$"),
    _: Principal = Depends(require_admin),
) -> dict[str, Any]:
    sent = await run_digest(frequency)
    return {"frequency": frequency, "sent": sent}


@router.get("/users/me/notifications/digest-preview", response_model=DigestPreviewOut)
async def digest_preview(
    principal: Principal = Depends(get_principal),
) -> DigestPreviewOut:
    data = await preview_digest(principal.user_id)
    notifs = data["notifications"]
    out_list = [
        NotificationOut(
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
        for n in notifs
    ]
    return DigestPreviewOut(
        user_id=data["user_id"],
        period_hours=data["period_hours"],
        notifications=out_list,
        count=data["count"],
    )
