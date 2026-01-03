"""Homework repository."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Homework


class HomeworkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(
        self, homework_id: int, *, include_deleted: bool = False
    ) -> Homework | None:
        stmt = select(Homework).where(Homework.id == homework_id)
        if not include_deleted:
            stmt = stmt.where(Homework.deleted_at.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_slug(self, course_id: int, slug: str) -> Homework | None:
        stmt = select(Homework).where(
            Homework.course_id == course_id,
            Homework.slug == slug,
            Homework.deleted_at.is_(None),
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_for_course(
        self,
        course_id: int,
        *,
        status: str | None = None,
        cursor_id: int | None = None,
        limit: int = 50,
        include_deleted: bool = False,
    ) -> tuple[Sequence[Homework], int | None]:
        stmt = select(Homework).where(Homework.course_id == course_id)
        if not include_deleted:
            stmt = stmt.where(Homework.deleted_at.is_(None))
        if status:
            stmt = stmt.where(Homework.status == status)
        if cursor_id is not None:
            stmt = stmt.where(Homework.id > cursor_id)
        stmt = stmt.order_by(Homework.position, Homework.id).limit(limit + 1)
        rows = list((await self.session.execute(stmt)).scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def create(self, homework: Homework) -> Homework:
        self.session.add(homework)
        await self.session.flush()
        return homework

    async def update(self, homework: Homework, **changes) -> Homework:
        for field, value in changes.items():
            setattr(homework, field, value)
        await self.session.flush()
        return homework

    async def soft_delete(self, homework: Homework) -> None:
        homework.deleted_at = datetime.now(tz=UTC)
        await self.session.flush()

    async def reorder(self, course_id: int, ordered_ids: list[int]) -> None:
        """Persist a new ordering. ``ordered_ids`` must list every homework
        of the course exactly once (caller validates)."""
        rows, _ = await self.list_for_course(course_id, limit=10_000)
        by_id = {h.id: h for h in rows}
        for pos, hw_id in enumerate(ordered_ids):
            hw = by_id.get(hw_id)
            if hw is not None:
                hw.position = pos
        await self.session.flush()
