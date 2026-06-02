"""Repository for admin-managed OAuth app credentials."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.common.ids import new_id
from integration_service.models.entities import OAuthAppCredentials


class OAuthAppCredentialsRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def list_for_tenant(self, tenant_id: str) -> list[OAuthAppCredentials]:
        stmt = select(OAuthAppCredentials).where(
            OAuthAppCredentials.tenant_id == tenant_id
        )
        return list((await self.s.execute(stmt)).scalars().all())

    async def get(
        self, tenant_id: str, provider_kind: str
    ) -> Optional[OAuthAppCredentials]:
        stmt = select(OAuthAppCredentials).where(
            OAuthAppCredentials.tenant_id == tenant_id,
            OAuthAppCredentials.provider_kind == provider_kind,
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def get_any(self, provider_kind: str) -> Optional[OAuthAppCredentials]:
        """Return any creds for this provider regardless of tenant. Used as a
        single-tenant fallback when the looked-up tenant has no row of its own
        — e.g. an admin in `system` configures the global app, and
        teachers in other tenants reuse it."""
        stmt = (
            select(OAuthAppCredentials)
            .where(OAuthAppCredentials.provider_kind == provider_kind)
            .order_by(OAuthAppCredentials.created_at.asc())
            .limit(1)
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def upsert(
        self,
        *,
        tenant_id: str,
        provider_kind: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        scope: Optional[str],
        created_by: Optional[str] = None,
    ) -> OAuthAppCredentials:
        existing = await self.get(tenant_id, provider_kind)
        if existing is not None:
            existing.client_id = client_id
            existing.client_secret = client_secret
            existing.redirect_uri = redirect_uri
            existing.scope = scope
            await self.s.flush()
            return existing
        row = OAuthAppCredentials(
            id=new_id("oac"),
            tenant_id=tenant_id,
            provider_kind=provider_kind,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            scope=scope,
            created_by=created_by,
        )
        self.s.add(row)
        await self.s.flush()
        return row

    async def delete(self, tenant_id: str, provider_kind: str) -> bool:
        existing = await self.get(tenant_id, provider_kind)
        if existing is None:
            return False
        await self.s.delete(existing)
        await self.s.flush()
        return True
