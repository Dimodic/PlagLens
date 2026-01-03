"""§H — incoming + outgoing webhooks."""
from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.ids import webhook_id
from ...common.problem import forbidden, not_found
from ...common.rbac import Principal
from ...models.plagiarism import WebhookSubscription
from ...repositories.webhook_repo import WebhookRepository
from ...schemas.webhooks import WebhookSubscriptionCreate, WebhookSubscriptionItem
from ..deps import get_db, get_principal_dep

router = APIRouter(tags=["webhooks"])


def _to_item(sub: WebhookSubscription) -> WebhookSubscriptionItem:
    return WebhookSubscriptionItem(
        id=sub.id,
        url=sub.url,
        events=list(sub.events or []),
        enabled=sub.enabled,
        created_at=sub.created_at,
        created_by=sub.created_by,
    )


# ---------- incoming (provider callbacks) ----------
@router.post("/webhooks/plagiarism/{provider}/{run_id}")
async def incoming_webhook(
    provider: str,
    run_id: str,
    request: Request,
) -> dict[str, Any]:
    """Receive provider-pushed completion. We accept and log; orchestrator polls
    are still authoritative — this is just a hint for faster transitions.
    """
    body = await request.body()
    return {
        "received": True,
        "provider": provider,
        "run_id": run_id,
        "size": len(body),
    }


# ---------- outgoing subscriptions ----------
@router.post(
    "/admin/plagiarism/webhook-subscriptions",
    response_model=WebhookSubscriptionItem,
    status_code=201,
)
async def create_subscription(
    body: WebhookSubscriptionCreate,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> WebhookSubscriptionItem:
    if not principal.is_admin():
        raise forbidden("Admin role required to manage webhooks")
    repo = WebhookRepository(db)
    sub = WebhookSubscription(
        id=webhook_id(),
        tenant_id=principal.tenant_id,
        url=str(body.url),
        events=list(body.events),
        secret=body.secret or secrets.token_urlsafe(32),
        enabled=True,
        created_by=principal.user_id,
    )
    await repo.add(sub)
    await db.commit()
    return _to_item(sub)


@router.get("/admin/plagiarism/webhook-subscriptions")
async def list_subscriptions(
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if not principal.is_admin():
        raise forbidden("Admin role required to manage webhooks")
    repo = WebhookRepository(db)
    items = await repo.list_for_tenant(principal.tenant_id)
    return {"data": [_to_item(s).model_dump() for s in items]}


@router.delete(
    "/admin/plagiarism/webhook-subscriptions/{sub_id}", status_code=204
)
async def delete_subscription(
    sub_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not principal.is_admin():
        raise forbidden("Admin role required to manage webhooks")
    repo = WebhookRepository(db)
    sub = await repo.get(sub_id)
    if sub is None or sub.tenant_id != principal.tenant_id:
        raise not_found(f"Subscription {sub_id} not found")
    await repo.soft_delete(sub_id)
    await db.commit()
