"""CourseMember / CourseOwner repository."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CourseMember, CourseOwner


class MemberRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_member(self, course_id: int, user_id: str) -> CourseMember | None:
        stmt = select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
            CourseMember.removed_at.is_(None),
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_members(
        self,
        course_id: int,
        *,
        role: str | None = None,
        cursor_id: int | None = None,
        limit: int = 50,
    ) -> tuple[Sequence[CourseMember], int | None]:
        stmt = select(CourseMember).where(
            CourseMember.course_id == course_id, CourseMember.removed_at.is_(None)
        )
        if role:
            stmt = stmt.where(CourseMember.role == role)
        if cursor_id is not None:
            stmt = stmt.where(CourseMember.id > cursor_id)
        stmt = stmt.order_by(CourseMember.id).limit(limit + 1)
        result = await self.session.execute(stmt)
        rows = list(result.scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def add_member(
        self, course_id: int, user_id: str, role: str
    ) -> CourseMember:
        member = CourseMember(course_id=course_id, user_id=user_id, role=role)
        self.session.add(member)
        await self.session.flush()
        return member

    async def update_role(self, member: CourseMember, role: str) -> CourseMember:
        member.role = role
        await self.session.flush()
        return member

    async def remove_member(self, member: CourseMember) -> None:
        member.removed_at = datetime.now(tz=UTC)
        await self.session.flush()

    async def get_owner(self, course_id: int, user_id: str) -> CourseOwner | None:
        stmt = select(CourseOwner).where(
            CourseOwner.course_id == course_id, CourseOwner.user_id == user_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_owners(self, course_id: int) -> Sequence[CourseOwner]:
        stmt = select(CourseOwner).where(CourseOwner.course_id == course_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def add_owner(self, course_id: int, user_id: str, role: str) -> CourseOwner:
        owner = CourseOwner(course_id=course_id, user_id=user_id, role=role)
        self.session.add(owner)
        await self.session.flush()
        return owner

    async def remove_owner(self, owner: CourseOwner) -> None:
        await self.session.delete(owner)
        await self.session.flush()
