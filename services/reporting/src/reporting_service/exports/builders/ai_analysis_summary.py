"""Builder: aggregated AI analysis summary."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.reporting import AssignmentStats, CourseStats, TenantStats
from .base import BuilderResult


async def build_ai_analysis_summary(
    session: AsyncSession, scope: dict[str, Any], options: dict[str, Any]
) -> BuilderResult:
    course_id = str(scope.get("course_id", ""))
    tenant_id = str(scope.get("tenant_id", ""))
    rows: list[dict[str, Any]] = []
    if course_id:
        cs = await session.get(CourseStats, course_id)
        if cs is not None:
            rows.append(
                {
                    "scope": "course",
                    "scope_id": course_id,
                    "ai_runs": cs.ai_runs_count,
                    "tokens_used": cs.ai_tokens_used,
                }
            )
        astmt = select(AssignmentStats).where(AssignmentStats.course_id == course_id)
        for a in (await session.execute(astmt)).scalars().all():
            rows.append(
                {
                    "scope": "assignment",
                    "scope_id": a.assignment_id,
                    "ai_runs": a.ai_completed_count,
                    "tokens_used": 0,
                }
            )
    elif tenant_id:
        t = await session.get(TenantStats, tenant_id)
        if t is not None:
            rows.append(
                {
                    "scope": "tenant",
                    "scope_id": tenant_id,
                    "ai_runs": t.ai_tokens_total_30d,  # placeholder absent runs counter
                    "tokens_used": t.ai_tokens_total_30d,
                    "cost_usd": round(t.ai_cost_total_30d, 4),
                }
            )
    columns = ["scope", "scope_id", "ai_runs", "tokens_used", "cost_usd"]
    columns = [c for c in columns if any(c in r for r in rows)] or columns
    return BuilderResult(
        title="AI Analysis Summary",
        columns=columns,
        rows=rows,
        metadata={"course_id": course_id, "tenant_id": tenant_id},
    )
