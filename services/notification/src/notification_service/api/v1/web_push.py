"""Section I: web push subscriptions (optional)."""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.db import get_db
from notification_service.errors import Problem
from notification_service.ids import webpush_id
from notification_service.models import WebPushSubscription
from notification_service.schemas import VapidKeyOut, WebPushOut, WebPushSubscribeBody
from notification_service.security import Principal, get_principal

router = APIRouter(tags=["web-push"])


@router.post(
    "/users/me/web-push/subscribe",
    response_model=WebPushOut,
    status_code=status.HTTP_201_CREATED,
)
async def subscribe(
    body: WebPushSubscribeBody,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> WebPushOut:
    stmt = select(WebPushSubscription).where(
        WebPushSubscription.user_id == principal.user_id,
        WebPushSubscription.endpoint == body.endpoint,
    )
    res = await db.execute(stmt)
    existing = res.scalars().first()
    if existing is not None:
        existing.keys = dict(body.keys or {})
        existing.user_agent = body.user_agent
        return WebPushOut.model_validate(existing)
    sub = WebPushSubscription(
        id=webpush_id(),
        user_id=principal.user_id,
        tenant_id=principal.tenant_id,
        endpoint=body.endpoint,
        keys=dict(body.keys or {}),
        user_agent=body.user_agent,
    )
    db.add(sub)
    await db.flush()
    return WebPushOut.model_validate(sub)


@router.delete("/users/me/web-push/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    endpoint: str,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> None:
    stmt = select(WebPushSubscription).where(
        WebPushSubscription.user_id == principal.user_id,
        WebPushSubscription.endpoint == endpoint,
    )
    res = await db.execute(stmt)
    sub = res.scalars().first()
    if sub is None:
        raise Problem(404, "NOT_FOUND", "Subscription not found")
    await db.delete(sub)
    return None


@router.get("/admin/notifications/web-push/vapid-key", response_model=VapidKeyOut)
async def vapid_key(
    _: Principal = Depends(get_principal),
) -> VapidKeyOut:
    pk = os.getenv("WEBPUSH_VAPID_PUBLIC_KEY", "BMockVapidKey")
    return VapidKeyOut(public_key=pk)
