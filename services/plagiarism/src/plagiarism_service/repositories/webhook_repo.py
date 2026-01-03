"""Repository for outgoing webhook subscriptions (§H)."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.plagiarism import WebhookSubscription


class WebhookRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, sub: WebhookSubscription) -> WebhookSubscription:
        self.session.add(sub)
        await self.session.flush()
        return sub

    async def list_for_tenant(self, tenant_id: str) -> list[WebhookSubscription]:
        stmt = (
            select(WebhookSubscription)
            .where(
                WebhookSubscription.tenant_id == tenant_id,
                WebhookSubscription.deleted_at.is_(None),
            )
            .order_by(WebhookSubscription.created_at.desc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_active_for_event(
        self, *, tenant_id: str, event_type: str
    ) -> list[WebhookSubscription]:
        stmt = select(WebhookSubscription).where(
            WebhookSubscription.tenant_id == tenant_id,
            WebhookSubscription.enabled.is_(True),
            WebhookSubscription.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        return [s for s in res.scalars().all() if event_type in (s.events or []) or "*" in (s.events or [])]

    async def get(self, sub_id: str) -> WebhookSubscription | None:
        return await self.session.get(WebhookSubscription, sub_id)

    async def soft_delete(self, sub_id: str) -> bool:
        sub = await self.session.get(WebhookSubscription, sub_id)
        if sub is None or sub.deleted_at is not None:
            return False
        sub.deleted_at = datetime.now(UTC)
        sub.enabled = False
        await self.session.flush()
        return True
