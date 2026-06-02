"""Assignment repository."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Assignment,
    AssignmentDeadlineExtension,
    AssignmentGradingConfig,
)


class AssignmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, assignment_id: int, *, include_deleted: bool = False) -> Assignment | None:
        stmt = select(Assignment).where(Assignment.id == assignment_id)
        if not include_deleted:
            stmt = stmt.where(Assignment.deleted_at.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_slug(
        self, course_id: int, slug: str, *, include_deleted: bool = False
    ) -> Assignment | None:
        """Slug is unique per course (uq_assignments_course_slug). Used
        by the auto-slug generator to probe for collisions."""
        stmt = select(Assignment).where(
            Assignment.course_id == course_id,
            Assignment.slug == slug,
        )
        if not include_deleted:
            stmt = stmt.where(Assignment.deleted_at.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_for_course(
        self,
        course_id: int,
        *,
        status: str | None = None,
        homework_id: int | None = None,
        cursor_id: int | None = None,
        limit: int = 50,
    ) -> tuple[Sequence[Assignment], int | None]:
        stmt = select(Assignment).where(
            Assignment.course_id == course_id, Assignment.deleted_at.is_(None)
        )
        if status:
            stmt = stmt.where(Assignment.status == status)
        if homework_id is not None:
            stmt = stmt.where(Assignment.homework_id == homework_id)
        if cursor_id is not None:
            stmt = stmt.where(Assignment.id > cursor_id)
        stmt = stmt.order_by(Assignment.id).limit(limit + 1)
        rows = list((await self.session.execute(stmt)).scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def list_for_homework(
        self,
        homework_id: int,
        *,
        status: str | None = None,
        cursor_id: int | None = None,
        limit: int = 50,
    ) -> tuple[Sequence[Assignment], int | None]:
        stmt = select(Assignment).where(
            Assignment.homework_id == homework_id, Assignment.deleted_at.is_(None)
        )
        if status:
            stmt = stmt.where(Assignment.status == status)
        if cursor_id is not None:
            stmt = stmt.where(Assignment.id > cursor_id)
        # Order by slug, then id — slugs encode the assignment letter for
        # imports (yc-73433-a / -b / -c …) so a slug sort gives A→Z natural
        # order, while ``id`` order shows whatever sequence the importer
        # happened to insert them in (parallel httpx calls = random).
        stmt = stmt.order_by(Assignment.slug, Assignment.id).limit(limit + 1)
        rows = list((await self.session.execute(stmt)).scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def list_with_filter(
        self,
        tenant_id: str | None,
        *,
        q: str | None = None,
        course_ids: list[int] | None = None,
        published_only: bool = False,
        cursor_id: int | None = None,
        limit: int = 20,
    ) -> tuple[Sequence[Assignment], int | None]:
        """Cross-course assignment search filter, tenant-scoped via Course join.

        ``course_ids`` — when provided, restricts to assignments in these courses
        (used for non-admin actors to enforce membership scope). When ``None``,
        returns all tenant assignments (admin).
        ``q`` — case-insensitive substring against title or slug.
        """
        from ..models import Course

        stmt = (
            select(Assignment)
            .join(Course, Assignment.course_id == Course.id)
            .where(
                Assignment.deleted_at.is_(None),
                Course.deleted_at.is_(None),
            )
        )
        # ``tenant_id=None`` → span ALL tenants (admin-only global search).
        if tenant_id is not None:
            stmt = stmt.where(Course.tenant_id == tenant_id)
        if course_ids is not None:
            if not course_ids:
                return [], None
            stmt = stmt.where(Assignment.course_id.in_(course_ids))
        if published_only:
            # Archive-only lifecycle: "published" was renamed to "active".
            # Keep the kwarg name for call-site stability — it now means
            # "exclude archived rows".
            stmt = stmt.where(Assignment.status == "active")
        if q:
            # LC_CTYPE=C → fold via ICU so Cyrillic titles match.
            like = f"%{q.lower()}%"
            title_l = func.lower(Assignment.title.collate("und-x-icu"))
            stmt = stmt.where(title_l.like(like) | Assignment.slug.ilike(like))
        if cursor_id is not None:
            stmt = stmt.where(Assignment.id > cursor_id)
        stmt = stmt.order_by(Assignment.title, Assignment.id).limit(limit + 1)
        rows = list((await self.session.execute(stmt)).scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def list_for_user(
        self,
        course_ids: list[int],
        *,
        published_only: bool = True,
        cursor_id: int | None = None,
        limit: int = 50,
    ) -> tuple[Sequence[Assignment], int | None]:
        if not course_ids:
            return [], None
        stmt = select(Assignment).where(
            Assignment.course_id.in_(course_ids), Assignment.deleted_at.is_(None)
        )
        if published_only:
            stmt = stmt.where(Assignment.status == "active")
        if cursor_id is not None:
            stmt = stmt.where(Assignment.id > cursor_id)
        stmt = stmt.order_by(Assignment.id).limit(limit + 1)
        rows = list((await self.session.execute(stmt)).scalars().all())
        next_id = rows[-1].id if len(rows) > limit else None
        return rows[:limit], next_id

    async def list_upcoming(
        self,
        course_ids: list[int],
        *,
        now: datetime,
        limit: int = 50,
    ) -> Sequence[Assignment]:
        if not course_ids:
            return []
        stmt = (
            select(Assignment)
            .where(
                Assignment.course_id.in_(course_ids),
                Assignment.deleted_at.is_(None),
                Assignment.status == "active",
                Assignment.deadline_hard_at.is_not(None),
                Assignment.deadline_hard_at > now,
            )
            .order_by(Assignment.deadline_hard_at)
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def create(self, assignment: Assignment) -> Assignment:
        self.session.add(assignment)
        await self.session.flush()
        return assignment

    async def soft_delete(self, assignment: Assignment) -> None:
        assignment.deleted_at = datetime.now(tz=UTC)
        await self.session.flush()

    async def get_grading_config(self, assignment_id: int) -> AssignmentGradingConfig | None:
        stmt = select(AssignmentGradingConfig).where(
            AssignmentGradingConfig.assignment_id == assignment_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def upsert_grading_config(
        self,
        assignment_id: int,
        *,
        rubric: dict | None = None,
        pass_threshold=None,
        visible_to_students_at: datetime | None = None,
    ) -> AssignmentGradingConfig:
        cfg = await self.get_grading_config(assignment_id)
        if cfg is None:
            cfg = AssignmentGradingConfig(
                assignment_id=assignment_id,
                rubric=rubric or {},
                pass_threshold=pass_threshold,
                visible_to_students_at=visible_to_students_at,
            )
            self.session.add(cfg)
        else:
            if rubric is not None:
                cfg.rubric = rubric
            if pass_threshold is not None:
                cfg.pass_threshold = pass_threshold
            if visible_to_students_at is not None:
                cfg.visible_to_students_at = visible_to_students_at
        await self.session.flush()
        return cfg

    async def list_extensions(
        self, assignment_id: int
    ) -> Sequence[AssignmentDeadlineExtension]:
        stmt = select(AssignmentDeadlineExtension).where(
            AssignmentDeadlineExtension.assignment_id == assignment_id
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_extension_for_user(
        self, assignment_id: int, user_id: str
    ) -> AssignmentDeadlineExtension | None:
        stmt = select(AssignmentDeadlineExtension).where(
            AssignmentDeadlineExtension.assignment_id == assignment_id,
            AssignmentDeadlineExtension.user_id == user_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_extension(
        self, assignment_id: int, ext_id: int
    ) -> AssignmentDeadlineExtension | None:
        stmt = select(AssignmentDeadlineExtension).where(
            AssignmentDeadlineExtension.id == ext_id,
            AssignmentDeadlineExtension.assignment_id == assignment_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def create_extension(
        self, ext: AssignmentDeadlineExtension
    ) -> AssignmentDeadlineExtension:
        self.session.add(ext)
        await self.session.flush()
        return ext

    async def delete_extension(self, ext: AssignmentDeadlineExtension) -> None:
        await self.session.delete(ext)
        await self.session.flush()

    async def soft_delete_for_course(self, course_id: int) -> int:
        stmt = select(Assignment).where(
            Assignment.course_id == course_id, Assignment.deleted_at.is_(None)
        )
        rows = list((await self.session.execute(stmt)).scalars().all())
        now = datetime.now(tz=UTC)
        for a in rows:
            a.deleted_at = now
        await self.session.flush()
        return len(rows)
