"""Repository for ``ProviderConfig`` (admin)."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.plagiarism import ProviderConfig


class ProviderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, *, tenant_id: str, provider: str) -> ProviderConfig | None:
        stmt = select(ProviderConfig).where(
            ProviderConfig.tenant_id == tenant_id,
            ProviderConfig.provider == provider,
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_for_tenant(self, *, tenant_id: str) -> list[ProviderConfig]:
        stmt = select(ProviderConfig).where(ProviderConfig.tenant_id == tenant_id)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def upsert(
        self,
        *,
        config_id: str,
        tenant_id: str,
        provider: str,
        enabled: bool | None = None,
        settings: dict | None = None,
        credentials_secret_ref: str | None = None,
    ) -> ProviderConfig:
        cfg = await self.get(tenant_id=tenant_id, provider=provider)
        if cfg is None:
            cfg = ProviderConfig(
                id=config_id,
                tenant_id=tenant_id,
                provider=provider,
                enabled=True if enabled is None else enabled,
                settings=settings or {},
                credentials_secret_ref=credentials_secret_ref,
            )
            self.session.add(cfg)
        else:
            if enabled is not None:
                cfg.enabled = enabled
            if settings is not None:
                cfg.settings = settings
            if credentials_secret_ref is not None:
                cfg.credentials_secret_ref = credentials_secret_ref
            cfg.updated_at = datetime.now(UTC)
        await self.session.flush()
        return cfg

    async def set_default(self, *, tenant_id: str, provider: str) -> ProviderConfig | None:
        # 1. Reset every other provider's default flag for this tenant.
        await self.session.execute(
            update(ProviderConfig)
            .where(ProviderConfig.tenant_id == tenant_id)
            .values(default_for_tenant=False)
        )
        cfg = await self.get(tenant_id=tenant_id, provider=provider)
        if cfg is None:
            return None
        cfg.default_for_tenant = True
        cfg.updated_at = datetime.now(UTC)
        await self.session.flush()
        return cfg
