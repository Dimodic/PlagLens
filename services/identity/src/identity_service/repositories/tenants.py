"""Tenant repository."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Tenant


class TenantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get(self, tenant_id: str) -> Tenant | None:
        return await self.s.get(Tenant, tenant_id)

    async def get_by_slug(self, slug: str) -> Tenant | None:
        stmt = select(Tenant).where(Tenant.slug == slug, Tenant.deleted_at.is_(None))
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def list(self, limit: int = 50, offset: int = 0) -> list[Tenant]:
        stmt = (
            select(Tenant)
            .where(Tenant.deleted_at.is_(None))
            .order_by(Tenant.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, tenant: Tenant) -> Tenant:
        self.s.add(tenant)
        await self.s.flush()
        return tenant
