"""Builder: course-summary."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.reporting import AssignmentStats, CourseStats
from .base import BuilderResult


async def build_course_summary(
    session: AsyncSession, scope: dict[str, Any], options: dict[str, Any]
) -> BuilderResult:
    course_id = str(scope.get("course_id", ""))
    cs = await session.get(CourseStats, course_id) if course_id else None
    rows: list[dict[str, Any]] = []
    if cs is not None:
        rows.append(
            {
                "course_id": cs.course_id,
                "enrolled_students": cs.enrolled_students,
                "assignments_count": cs.assignments_count,
                "submissions_total": cs.submissions_total,
                "average_score": round(cs.average_score, 2),
                "plagiarism_alerts_count": cs.plagiarism_alerts_count,
                "ai_runs_count": cs.ai_runs_count,
                "ai_tokens_used": cs.ai_tokens_used,
                "archived": cs.archived,
            }
        )
    if course_id:
        stmt = select(AssignmentStats).where(AssignmentStats.course_id == course_id)
        for a in (await session.execute(stmt)).scalars().all():
            rows.append(
                {
                    "course_id": a.course_id,
                    "assignment_id": a.assignment_id,
                    "submissions": a.submissions_count,
                    "average_score": round(a.average_score, 2),
                    "max_similarity": round(a.max_similarity, 2),
                    "suspicious_count": a.suspicious_count,
                }
            )
    columns = ["course_id", "assignment_id", "submissions", "average_score", "max_similarity",
               "suspicious_count", "enrolled_students", "assignments_count", "submissions_total",
               "plagiarism_alerts_count", "ai_runs_count", "ai_tokens_used", "archived"]
    columns = [c for c in columns if any(c in r for r in rows)] or ["course_id"]
    return BuilderResult(
        title="Course Summary",
        columns=columns,
        rows=rows,
        metadata={"course_id": course_id},
    )
