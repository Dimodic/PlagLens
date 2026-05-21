"""Invitation repository."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CourseInvitation


class InvitationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, course_id: int, invitation_id: int) -> CourseInvitation | None:
        stmt = select(CourseInvitation).where(
            CourseInvitation.id == invitation_id,
            CourseInvitation.course_id == course_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_code(self, code: str) -> CourseInvitation | None:
        stmt = select(CourseInvitation).where(CourseInvitation.code == code)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list(
        self,
        course_id: int,
        *,
        cursor_id: int | None = None,
        limit: int = 50,
    ) -> tuple[Sequence[CourseInvitation], int | None]:
        stmt = select(CourseInvitation).where(CourseInvitation.course_id == course_id)
        if cursor_id is not None:
            stmt = stmt.where(CourseInvitation.id > cursor_id)
        stmt = stmt.order_by(CourseInvitation.id).limit(limit + 1)
        result = await self.session.execute(stmt)
        rows = list(result.scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def create(self, invitation: CourseInvitation) -> CourseInvitation:
        self.session.add(invitation)
        await self.session.flush()
        return invitation

    async def consume(self, invitation: CourseInvitation) -> None:
        invitation.used_count += 1
        await self.session.flush()

    async def revoke(self, invitation: CourseInvitation) -> None:
        invitation.revoked_at = datetime.now(tz=UTC)
        await self.session.flush()
