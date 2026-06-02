"""Course repository."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Course, CourseMember, CourseOwner


class CourseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, course_id: int, *, include_deleted: bool = False) -> Course | None:
        stmt = select(Course).where(Course.id == course_id)
        if not include_deleted:
            stmt = stmt.where(Course.deleted_at.is_(None))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_in_tenant(
        self, course_id: int, tenant_id: str, *, include_deleted: bool = False
    ) -> Course | None:
        course = await self.get(course_id, include_deleted=include_deleted)
        if course is None or course.tenant_id != tenant_id:
            return None
        return course

    async def get_by_slug(self, tenant_id: str, slug: str) -> Course | None:
        stmt = select(Course).where(
            Course.tenant_id == tenant_id, Course.slug == slug, Course.deleted_at.is_(None)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self,
        tenant_id: str | None,
        *,
        status: str | None = None,
        owner_id: str | None = None,
        member_id: str | None = None,
        q: str | None = None,
        cursor_id: int | None = None,
        limit: int = 50,
        include_deleted: bool = False,
    ) -> tuple[Sequence[Course], int | None]:
        # ``tenant_id=None`` → span ALL tenants (admin-only global search).
        stmt = select(Course)
        if tenant_id is not None:
            stmt = stmt.where(Course.tenant_id == tenant_id)
        if not include_deleted:
            stmt = stmt.where(Course.deleted_at.is_(None))
        if status:
            stmt = stmt.where(Course.status == status)
        if owner_id:
            stmt = stmt.where(Course.owner_id == owner_id)
        if member_id:
            sub = select(CourseMember.course_id).where(
                CourseMember.user_id == member_id, CourseMember.removed_at.is_(None)
            )
            stmt = stmt.where(Course.id.in_(sub))
        if q:
            # LC_CTYPE=C → fold via ICU so Cyrillic names match.
            like = f"%{q.lower()}%"
            name_l = func.lower(Course.name.collate("und-x-icu"))
            stmt = stmt.where(name_l.like(like) | Course.slug.ilike(like))
        if cursor_id is not None:
            stmt = stmt.where(Course.id > cursor_id)
        stmt = stmt.order_by(Course.id).limit(limit + 1)
        result = await self.session.execute(stmt)
        rows = list(result.scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def create(self, course: Course, primary_owner_id: str) -> Course:
        self.session.add(course)
        await self.session.flush()
        owner = CourseOwner(
            course_id=course.id, user_id=primary_owner_id, role="owner"
        )
        self.session.add(owner)
        await self.session.flush()
        return course

    async def soft_delete(self, course: Course, *, by_user: str) -> None:
        now = datetime.now(tz=UTC)
        course.deleted_at = now
        course.status = "archived"
        await self.session.flush()

    async def list_courses_for_user(
        self,
        user_id: str,
        tenant_id: str,
        *,
        status: str | None = None,
        q: str | None = None,
        cursor_id: int | None = None,
        limit: int = 50,
    ) -> tuple[Sequence[Course], int | None]:
        member_sub = select(CourseMember.course_id).where(
            CourseMember.user_id == user_id, CourseMember.removed_at.is_(None)
        )
        owner_sub = select(CourseOwner.course_id).where(CourseOwner.user_id == user_id)
        stmt = select(Course).where(
            Course.tenant_id == tenant_id,
            Course.deleted_at.is_(None),
            Course.id.in_(member_sub.union(owner_sub)),
        )
        if q:
            # Same ICU fold as list_for_tenant so global search filters the
            # user's own courses by query instead of ignoring it.
            like = f"%{q.lower()}%"
            name_l = func.lower(Course.name.collate("und-x-icu"))
            stmt = stmt.where(name_l.like(like) | Course.slug.ilike(like))
        # ``status`` filter — equivalent of what list_for_tenant does for
        # admins. Without it the teacher-facing /courses endpoint ignored
        # ?status=archived and always returned the full set, making the
        # archive toggle on the UI look broken.
        if status:
            stmt = stmt.where(Course.status == status)
        if cursor_id is not None:
            stmt = stmt.where(Course.id > cursor_id)
        stmt = stmt.order_by(Course.id).limit(limit + 1)
        result = await self.session.execute(stmt)
        rows = list(result.scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id
