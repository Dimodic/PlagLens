"""Group repository."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Group, GroupMember


class GroupRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, course_id: int, group_id: int) -> Group | None:
        stmt = select(Group).where(
            Group.id == group_id,
            Group.course_id == course_id,
            Group.deleted_at.is_(None),
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list(
        self, course_id: int, *, cursor_id: int | None = None, limit: int = 50
    ) -> tuple[Sequence[Group], int | None]:
        stmt = select(Group).where(
            Group.course_id == course_id, Group.deleted_at.is_(None)
        )
        if cursor_id is not None:
            stmt = stmt.where(Group.id > cursor_id)
        stmt = stmt.order_by(Group.id).limit(limit + 1)
        rows = list((await self.session.execute(stmt)).scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def create(self, group: Group) -> Group:
        self.session.add(group)
        await self.session.flush()
        return group

    async def soft_delete(self, group: Group) -> None:
        group.deleted_at = datetime.now(tz=UTC)
        await self.session.flush()

    async def get_member(self, group_id: int, user_id: str) -> GroupMember | None:
        stmt = select(GroupMember).where(
            GroupMember.group_id == group_id, GroupMember.user_id == user_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_members(self, group_id: int) -> Sequence[GroupMember]:
        stmt = select(GroupMember).where(GroupMember.group_id == group_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def add_member(self, group_id: int, user_id: str) -> GroupMember:
        member = GroupMember(group_id=group_id, user_id=user_id)
        self.session.add(member)
        await self.session.flush()
        return member

    async def remove_member(self, member: GroupMember) -> None:
        await self.session.delete(member)
        await self.session.flush()
