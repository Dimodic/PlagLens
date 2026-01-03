"""Repositories for retention policy + legal holds."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.ids import legal_hold_id, retention_id
from ..models import LegalHold, RetentionPolicy


class RetentionPolicyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_for_tenant(self, tenant_id: str | None) -> RetentionPolicy | None:
        stmt = select(RetentionPolicy).where(
            RetentionPolicy.scope == "tenant",
            RetentionPolicy.scope_id == tenant_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_or_create_for_tenant(
        self, tenant_id: str | None, default_days: int, long_days: int
    ) -> RetentionPolicy:
        existing = await self.get_for_tenant(tenant_id)
        if existing is not None:
            return existing
        policy = RetentionPolicy(
            id=retention_id(),
            scope="tenant",
            scope_id=tenant_id,
            default_retention_days=default_days,
            long_retention_days=long_days,
            legal_hold_active=False,
        )
        self.session.add(policy)
        await self.session.flush()
        return policy

    async def update(self, policy: RetentionPolicy, **fields) -> RetentionPolicy:
        for k, v in fields.items():
            if v is not None and hasattr(policy, k):
                setattr(policy, k, v)
        policy.updated_at = datetime.now(UTC)
        await self.session.flush()
        return policy


class LegalHoldRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_active(self, *, tenant_id: str | None) -> list[LegalHold]:
        stmt = select(LegalHold).where(LegalHold.ended_at.is_(None))
        if tenant_id is not None:
            stmt = stmt.where(LegalHold.tenant_id == tenant_id)
        stmt = stmt.order_by(LegalHold.started_at.desc())
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_active_resource_ids(self, tenant_id: str | None) -> set[str]:
        stmt = select(LegalHold.resource_id).where(LegalHold.ended_at.is_(None))
        if tenant_id is not None:
            stmt = stmt.where(LegalHold.tenant_id == tenant_id)
        rows = (await self.session.execute(stmt)).scalars().all()
        return set(rows)

    async def create(
        self,
        *,
        tenant_id: str | None,
        resource_id: str,
        resource_type: str | None,
        reason: str,
        requested_by: str | None,
    ) -> LegalHold:
        hold = LegalHold(
            id=legal_hold_id(),
            tenant_id=tenant_id,
            resource_type=resource_type,
            resource_id=resource_id,
            reason=reason,
            requested_by=requested_by,
        )
        self.session.add(hold)
        await self.session.flush()
        return hold

    async def end(self, hold_id: str, *, tenant_id: str | None) -> bool:
        stmt = select(LegalHold).where(LegalHold.id == hold_id)
        if tenant_id is not None:
            stmt = stmt.where(LegalHold.tenant_id == tenant_id)
        hold = (await self.session.execute(stmt)).scalar_one_or_none()
        if hold is None:
            return False
        hold.ended_at = datetime.now(UTC)
        await self.session.flush()
        return True

    async def hard_delete(self, hold_id: str) -> None:
        await self.session.execute(delete(LegalHold).where(LegalHold.id == hold_id))
