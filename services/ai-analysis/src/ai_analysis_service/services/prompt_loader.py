"""Prompt loader: hits DB for tenant active version, falls back to built-ins."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import PromptVersion
from ..prompts import DEFAULT_PROMPT_VERSION, get_builtin
from .orchestrator import PromptBundle


class PromptLoader:
    async def load(
        self, session: AsyncSession, tenant_id: str, prompt_version: str | None
    ) -> PromptBundle:
        # Specific id requested
        if prompt_version:
            row = await self._fetch_by_id(session, tenant_id, prompt_version)
            if row:
                return _to_bundle(row)
            builtin = get_builtin(prompt_version)
            if builtin:
                return _builtin_bundle(builtin)
        # Tenant active
        row = await self._fetch_active(session, tenant_id)
        if row:
            return _to_bundle(row)
        # Hard fallback
        builtin = get_builtin(DEFAULT_PROMPT_VERSION)
        assert builtin is not None
        return _builtin_bundle(builtin)

    @staticmethod
    async def _fetch_by_id(
        session: AsyncSession, tenant_id: str, version_id: str
    ) -> PromptVersion | None:
        stmt = select(PromptVersion).where(
            PromptVersion.id == version_id,
            PromptVersion.tenant_id == tenant_id,
            PromptVersion.deleted_at.is_(None),
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def _fetch_active(
        session: AsyncSession, tenant_id: str
    ) -> PromptVersion | None:
        stmt = (
            select(PromptVersion)
            .where(
                PromptVersion.tenant_id == tenant_id,
                PromptVersion.active_for_tenant.is_(True),
                PromptVersion.deleted_at.is_(None),
            )
            .order_by(PromptVersion.created_at.desc())
            .limit(1)
        )
        return (await session.execute(stmt)).scalar_one_or_none()


def _to_bundle(row: PromptVersion) -> PromptBundle:
    return PromptBundle(
        id=row.id,
        system_prompt=row.system_prompt,
        user_template=row.user_template,
        json_schema=row.json_schema,
    )


def _builtin_bundle(b: dict) -> PromptBundle:
    return PromptBundle(
        id=b["id"],
        system_prompt=b["system_prompt"],
        user_template=b["user_template"],
        json_schema=b["json_schema"],
    )
