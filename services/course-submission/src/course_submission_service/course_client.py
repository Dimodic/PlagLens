"""In-process CourseClient for the merged course+submission service.

Replaces submission's cross-service HTTP call (``HttpCourseClient``) with direct
reads of the course tables in the same process / shared DB. Implements
submission's ``CourseClient`` Protocol (``get_assignment``).

Note the boundary mapping: course uses integer PKs while submission addresses
assignments by string id, and ``tenant_id`` lives on ``Course`` (not
``Assignment``) — both are reconciled here.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from course_service.models import Assignment, Course
from submission_service.services.course_client import AssignmentInfo


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


__all__ = ["InProcessCourseClient"]
