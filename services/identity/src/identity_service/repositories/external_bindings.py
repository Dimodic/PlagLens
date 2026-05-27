"""External binding repository (Stepik / Yandex.Contest user mappings)."""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ExternalBinding


class ExternalBindingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get(self, binding_id: str) -> ExternalBinding | None:
        return await self.s.get(ExternalBinding, binding_id)

    async def get_by_external(
        self, system: str, external_id: str
    ) -> ExternalBinding | None:
        """Look up the binding for an external identity (system, external_id).

        The (system, external_id) pair is globally unique (uq_external_binding),
        so this returns at most one row — used to detect whether a participant
        is already linked, and to whom.
        """
        stmt = select(ExternalBinding).where(
            ExternalBinding.system == system,
            ExternalBinding.external_id == external_id,
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def list_for_user(self, user_id: str) -> list[ExternalBinding]:
        stmt = select(ExternalBinding).where(ExternalBinding.user_id == user_id)
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, binding: ExternalBinding) -> ExternalBinding:
        self.s.add(binding)
        await self.s.flush()
        return binding

    async def delete(self, binding_id: str) -> int:
        result = await self.s.execute(
            delete(ExternalBinding).where(ExternalBinding.id == binding_id)
        )
        return result.rowcount or 0
