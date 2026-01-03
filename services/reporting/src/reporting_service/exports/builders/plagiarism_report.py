"""Builder: plagiarism report (per assignment / course)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.reporting import AssignmentStats
from .base import BuilderResult


async def build_plagiarism_report(
    session: AsyncSession, scope: dict[str, Any], options: dict[str, Any]
) -> BuilderResult:
    course_id = str(scope.get("course_id", ""))
    assignment_id = str(scope.get("assignment_id", ""))
    pairs = scope.get("pairs", [])  # optional: caller passes precomputed pairs
    rows: list[dict[str, Any]] = []
    flags: list[dict[str, str]] = []

    if assignment_id:
        a = await session.get(AssignmentStats, assignment_id)
        if a is not None:
            rows.append(
                {
                    "assignment_id": a.assignment_id,
                    "course_id": a.course_id,
                    "submissions": a.submissions_count,
                    "max_similarity": round(a.max_similarity, 2),
                    "suspicious_count": a.suspicious_count,
                }
            )
    elif course_id:
        stmt = select(AssignmentStats).where(AssignmentStats.course_id == course_id)
        for idx, a in enumerate((await session.execute(stmt)).scalars().all()):
            rows.append(
                {
                    "assignment_id": a.assignment_id,
                    "course_id": a.course_id,
                    "submissions": a.submissions_count,
                    "max_similarity": round(a.max_similarity, 2),
                    "suspicious_count": a.suspicious_count,
                }
            )
            if a.max_similarity >= 0.85:
                flags.append({"row": str(idx), "column": "max_similarity", "level": "danger"})
    for pair in pairs:
        rows.append(pair)
    columns = ["assignment_id", "course_id", "submissions", "max_similarity", "suspicious_count"]
    return BuilderResult(
        title="Plagiarism Report",
        columns=columns,
        rows=rows,
        metadata={"course_id": course_id, "assignment_id": assignment_id},
        cell_flags=flags,
    )
