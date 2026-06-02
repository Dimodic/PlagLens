"""In-process CourseClient for the merged course+submission service.

Replaces submission's cross-service HTTP call (``HttpCourseClient``) with direct
reads of the course tables in the same process / shared DB. Implements
submission's ``CourseClient`` Protocol (``get_assignment`` plus the read-model
methods that power student/staff scoping + search in ``self_service``).

Note the boundary mapping: course uses integer PKs while submission addresses
assignments / courses by string id, and ``tenant_id`` lives on ``Course`` (not
``Assignment``) — both are reconciled here. These methods used to live as
direct cross-schema queries inside ``self_service``; they now sit behind the
``CourseClient`` seam, with the EXACT same query semantics preserved.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from course_service.models import Assignment, Course, CourseMember, CourseOwner, Homework
from submission_service.services.course_client import AssignmentInfo, AssignmentTitles


class InProcessCourseClient:
    """``CourseClient`` backed by direct in-process reads of course tables."""

    def __init__(self, session_factory: async_sessionmaker[Any]) -> None:
        self._session_factory = session_factory

    async def get_assignment(
        self, assignment_id: str, *, auth_token: str | None = None
    ) -> AssignmentInfo | None:
        # ``auth_token`` is part of the ``CourseClient`` protocol so callers
        # (e.g. submission's batchImport route) can pass the user's bearer
        # to ``HttpCourseClient`` for cross-tenant reads. We're in-process —
        # the row lookup goes through the DB session, no HTTP auth needed —
        # so we accept and ignore it to stay duck-compatible with the http
        # client. (See submission_service.api.routers.bulk.import_batch.)
        del auth_token
        try:
            aid = int(assignment_id)
        except (TypeError, ValueError):
            return None
        async with self._session_factory() as session:
            assignment = (
                await session.execute(select(Assignment).where(Assignment.id == aid))
            ).scalar_one_or_none()
            if assignment is None or assignment.deleted_at is not None:
                return None
            course = (
                await session.execute(select(Course).where(Course.id == assignment.course_id))
            ).scalar_one_or_none()
            return AssignmentInfo(
                id=str(assignment.id),
                course_id=str(assignment.course_id),
                tenant_id=str(course.tenant_id) if course else "",
                deadline_soft_at=assignment.deadline_soft_at,
                deadline_hard_at=assignment.deadline_hard_at,
                late_score_multiplier=float(assignment.late_score_multiplier),
                selection_strategy=assignment.selection_strategy,
                visible_to_students_at=None,
                max_score=(
                    float(assignment.max_score) if assignment.max_score is not None else None
                ),
            )

    async def visible_course_ids(self, user_id: str) -> set[str]:
        # Replicates self_service._visible_course_ids: owner rows are always
        # included; member rows only while removed_at IS NULL. Returns the
        # string-keyed union to match Submission.course_id.
        async with self._session_factory() as session:
            member_ids = (
                await session.execute(
                    select(CourseMember.course_id).where(
                        CourseMember.user_id == user_id,
                        CourseMember.removed_at.is_(None),
                    )
                )
            ).scalars().all()
            owner_ids = (
                await session.execute(
                    select(CourseOwner.course_id).where(CourseOwner.user_id == user_id)
                )
            ).scalars().all()
        return {str(c) for c in (*member_ids, *owner_ids)}

    async def staff_course_ids(self, user_id: str) -> set[str]:
        # Replicates the assistant-scoping block in self_service.my_submissions:
        # membership + ownership, WITHOUT the removed_at filter (the looser
        # variant), string-keyed.
        async with self._session_factory() as session:
            member_ids = (
                await session.execute(
                    select(CourseMember.course_id).where(
                        CourseMember.user_id == user_id
                    )
                )
            ).scalars().all()
            owner_ids = (
                await session.execute(
                    select(CourseOwner.course_id).where(CourseOwner.user_id == user_id)
                )
            ).scalars().all()
        return {str(c) for c in (*member_ids, *owner_ids)}

    async def search_assignment_ids_by_title(self, query: str) -> set[str]:
        # Replicates the title-search block in self_service.my_submissions:
        # match assignment titles directly, plus assignments whose parent
        # homework title matches, ICU-folding both so Cyrillic ДЗ/задание
        # titles match under LC_CTYPE=C. Best-effort — any failure yields an
        # empty set (title match is non-critical).
        ql = query.strip().lower()
        if not ql:
            return set()
        try:
            async with self._session_factory() as session:
                _t = func.lower(Assignment.title.collate("und-x-icu"))
                _h = func.lower(Homework.title.collate("und-x-icu"))
                asg_ids = (
                    await session.execute(
                        select(Assignment.id).where(_t.like(f"%{ql}%"))
                    )
                ).scalars().all()
                hw_asg_ids = (
                    await session.execute(
                        select(Assignment.id)
                        .join(Homework, Assignment.homework_id == Homework.id)
                        .where(_h.like(f"%{ql}%"))
                    )
                ).scalars().all()
            return {str(a) for a in (*asg_ids, *hw_asg_ids)}
        except Exception:  # noqa: BLE001 — title match is best-effort
            return set()

    async def enrich_titles(
        self, assignment_ids: list[str]
    ) -> dict[str, AssignmentTitles]:
        # Replicates self_service._enrich_titles: resolve assignment title +
        # parent homework title + course name via three batched IN lookups
        # against the course schema. Only integer-parseable ids are queried
        # (mirrors the old int() guard); course ids are filtered to digits
        # before the IN (mirrors the old isdigit() guard).
        asg_id_set: set[int] = set()
        for raw in assignment_ids:
            try:
                asg_id_set.add(int(raw))
            except (TypeError, ValueError):
                continue
        if not asg_id_set:
            return {}
        async with self._session_factory() as session:
            asg_rows = (
                await session.execute(
                    select(Assignment).where(Assignment.id.in_(asg_id_set))
                )
            ).scalars().all()
            asg_map: dict[str, Assignment] = {str(a.id): a for a in asg_rows}

            hw_ids = {a.homework_id for a in asg_rows if a.homework_id is not None}
            hw_map: dict[str, str] = {}
            if hw_ids:
                hw_rows = (
                    await session.execute(
                        select(Homework).where(Homework.id.in_(hw_ids))
                    )
                ).scalars().all()
                hw_map = {str(h.id): h.title for h in hw_rows}

            course_ids = {str(a.course_id) for a in asg_rows}
            course_map: dict[str, str] = {}
            if course_ids:
                course_rows = (
                    await session.execute(
                        select(Course).where(
                            Course.id.in_([int(c) for c in course_ids if c.isdigit()])
                        )
                    )
                ).scalars().all()
                course_map = {str(c.id): c.name for c in course_rows}

        out: dict[str, AssignmentTitles] = {}
        for sid, a in asg_map.items():
            out[sid] = AssignmentTitles(
                assignment_title=a.title,
                homework_title=(
                    hw_map.get(str(a.homework_id)) if a.homework_id is not None else None
                ),
                course_name=course_map.get(str(a.course_id)),
            )
        return out


__all__ = ["InProcessCourseClient"]
