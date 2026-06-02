"""External binding repository (Stepik / Yandex.Contest user mappings)."""
from __future__ import annotations

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ExternalBinding, User


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

    async def rename_yc_external_id(
        self, *, from_external_id: str, to_external_id: str
    ) -> int:
        """Swap a Yandex.Contest binding's ``external_id`` (one remap).

        Used by the YC author-id reconciliation: a binding stored under the
        unstable ``yc:<participantId>`` key is rewritten to the stable
        ``yc:<login>`` form. Only ``external_id`` changes — ``user_id`` keeps
        pointing at the same person. Scoped to ``system='yandex_contest'``;
        idempotent (a second run matches nothing → 0). Returns rows updated.
        """
        result = await self.s.execute(
            update(ExternalBinding)
            .where(
                ExternalBinding.system == "yandex_contest",
                ExternalBinding.external_id == from_external_id,
            )
            .values(external_id=to_external_id)
        )
        return result.rowcount or 0

    async def list_yc_for_tenant(
        self, *, tenant_id: str
    ) -> list[ExternalBinding]:
        """Every ``yandex_contest`` binding whose user lives in ``tenant_id``.

        Joins identity's OWN ``users`` table to restrict the result to the
        given tenant — this is the list submission-service uses for its claim
        pass (rewrite ``author_id`` from the external key to the bound
        ``user_id``), so it must never leak another tenant's bindings.
        """
        stmt = (
            select(ExternalBinding)
            .join(User, User.id == ExternalBinding.user_id)
            .where(
                ExternalBinding.system == "yandex_contest",
                User.tenant_id == tenant_id,
            )
        )
        return list((await self.s.execute(stmt)).scalars().all())
