"""WebhookEvent repository."""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.models import WebhookEvent


class WebhookEventRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, evt: WebhookEvent) -> WebhookEvent:
        self.session.add(evt)
        await self.session.flush()
        return evt

    async def get_by_external(
        self, kind: str, external_event_id: str
    ) -> Optional[WebhookEvent]:
        stmt = select(WebhookEvent).where(
            WebhookEvent.kind == kind,
            WebhookEvent.external_event_id == external_event_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_recent(
        self, tenant_id: Optional[str] = None, kind: Optional[str] = None, limit: int = 100
    ) -> List[WebhookEvent]:
        stmt = select(WebhookEvent).order_by(WebhookEvent.received_at.desc()).limit(limit)
        if tenant_id is not None:
            stmt = stmt.where(WebhookEvent.tenant_id == tenant_id)
        if kind is not None:
            stmt = stmt.where(WebhookEvent.kind == kind)
        return list((await self.session.execute(stmt)).scalars().all())
