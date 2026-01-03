"""Builder dispatch.

Builders take ``(session, scope, options)`` and return a ``BuilderResult``
which is a row-oriented dataset. Formats consume that.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

BuilderRow = dict[str, Any]


@dataclass
class BuilderResult:
    title: str
    columns: list[str]
    rows: list[BuilderRow] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    cell_flags: list[dict[str, str]] = field(default_factory=list)
    # Per-cell free-text annotations — e.g. a teacher's grade comment.
    # Each entry is ``{"row": <int index into rows>, "column": <name>,
    # "note": <text>}``. Only the ``google_sheets`` format consumes these
    # (written as native cell notes); flat formats like CSV ignore them.
    cell_notes: list[dict[str, Any]] = field(default_factory=list)


BuilderFn = Callable[[AsyncSession, dict[str, Any], dict[str, Any]], Awaitable[BuilderResult]]


async def build_dataset(
    kind: str,
    session: AsyncSession,
    scope: dict[str, Any],
    options: dict[str, Any],
    *,
    bearer_token: str | None = None,
) -> BuilderResult:
    from .ai_analysis_summary import build_ai_analysis_summary
    from .assignment_grades import build_assignment_grades
    from .audit_log import build_audit_log
    from .course_summary import build_course_summary
    from .plagiarism_report import build_plagiarism_report
    from .tenant_usage import build_tenant_usage

    registry: dict[str, BuilderFn] = {
        "assignment_grades": build_assignment_grades,
        "course_summary": build_course_summary,
        "plagiarism_report": build_plagiarism_report,
        "ai_analysis_summary": build_ai_analysis_summary,
        "audit_log": build_audit_log,
        "tenant_usage": build_tenant_usage,
    }
    fn = registry.get(kind)
    if fn is None:
        raise ValueError(f"Unknown export kind: {kind}")
    # ``assignment_grades`` is the only builder that reaches out over HTTP
    # (to fetch live per-student grades + comments) and therefore needs the
    # caller's bearer token. The rest are pure read-model queries.
    if kind == "assignment_grades":
        return await build_assignment_grades(
            session, scope, options, bearer_token=bearer_token
        )
    return await fn(session, scope, options)
