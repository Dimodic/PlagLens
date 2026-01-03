"""IntegrationConfig repository."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import List, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.models import IntegrationConfig


class IntegrationConfigRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, cfg: IntegrationConfig) -> IntegrationConfig:
        self.session.add(cfg)
        await self.session.flush()
        return cfg

    async def get(
        self, config_id: str, tenant_id: Optional[str] = None
    ) -> Optional[IntegrationConfig]:
        stmt = select(IntegrationConfig).where(
            IntegrationConfig.id == config_id,
            IntegrationConfig.deleted_at.is_(None),
        )
        if tenant_id is not None:
            stmt = stmt.where(IntegrationConfig.tenant_id == tenant_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_(
        self,
        tenant_id: str,
        course_id: Optional[str] = None,
        kind: Optional[str] = None,
        status: Optional[str] = None,
        include_deleted: bool = False,
        limit: int = 50,
    ) -> List[IntegrationConfig]:
        conds = [IntegrationConfig.tenant_id == tenant_id]
        if not include_deleted:
            conds.append(IntegrationConfig.deleted_at.is_(None))
        if course_id is not None:
            conds.append(IntegrationConfig.course_id == course_id)
        if kind is not None:
            conds.append(IntegrationConfig.kind == kind)
        if status is not None:
            conds.append(IntegrationConfig.status == status)
        stmt = (
            select(IntegrationConfig)
            .where(and_(*conds))
            .order_by(IntegrationConfig.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_by_course(
        self, tenant_id: str, course_id: str
    ) -> List[IntegrationConfig]:
        return await self.list_(tenant_id=tenant_id, course_id=course_id)

    async def soft_delete(self, cfg: IntegrationConfig) -> None:
        cfg.deleted_at = datetime.now(UTC)
        await self.session.flush()

    async def touch(self, cfg: IntegrationConfig) -> None:
        cfg.updated_at = datetime.now(UTC)
        await self.session.flush()
