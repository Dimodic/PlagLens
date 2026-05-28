"""Invitation repository."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Invitation


class InvitationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get(self, invitation_id: str) -> Invitation | None:
        return await self.s.get(Invitation, invitation_id)

    async def get_by_token_hash(self, token_hash: str) -> Invitation | None:
        stmt = select(Invitation).where(Invitation.token_hash == token_hash)
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def get_by_code(self, tenant_id: str, code: str) -> Invitation | None:
        stmt = select(Invitation).where(
            Invitation.tenant_id == tenant_id, Invitation.code == code
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def get_by_code_global(self, code: str) -> Invitation | None:
        """Tenant-agnostic lookup. Used by the redeem path to support the
        «move user out of the default tenant» case: the redeemer's
        ``tenant_id`` is the placeholder «public», the code belongs to
        the real organisation's tenant, and the handler decides whether
        to migrate the user before continuing the normal redeem flow."""
        stmt = select(Invitation).where(Invitation.code == code)
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def list_binding_invitations(
        self, *, tenant_id: str, binding_system: str
    ) -> list[Invitation]:
        """Live (non-revoked, non-accepted) binding-carrying invitations for a
        tenant + binding system. Used by the bulk-mint endpoint to dedup
        re-runs — a participant who already has a usable code keeps it.
        """
        stmt = select(Invitation).where(
            Invitation.tenant_id == tenant_id,
            Invitation.binding_system == binding_system,
            Invitation.binding_external_id.is_not(None),
            Invitation.revoked_at.is_(None),
            Invitation.accepted_at.is_(None),
        )
        return list((await self.s.execute(stmt)).scalars().all())

    async def list_for_creator(
        self, creator_user_id: str | None, tenant_id: str | None = None, limit: int = 50
    ) -> list[Invitation]:
        stmt = select(Invitation)
        if creator_user_id:
            stmt = stmt.where(Invitation.created_by == creator_user_id)
        if tenant_id:
            stmt = stmt.where(Invitation.tenant_id == tenant_id)
        stmt = stmt.order_by(Invitation.created_at.desc()).limit(limit)
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, invitation: Invitation) -> Invitation:
        self.s.add(invitation)
        await self.s.flush()
        return invitation

    async def revoke(self, invitation_id: str) -> None:
        await self.s.execute(
            update(Invitation)
            .where(Invitation.id == invitation_id, Invitation.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )

    async def mark_accepted(self, invitation_id: str, user_id: str) -> None:
        await self.s.execute(
            update(Invitation)
            .where(Invitation.id == invitation_id)
            .values(accepted_by=user_id, accepted_at=datetime.now(timezone.utc))
        )
