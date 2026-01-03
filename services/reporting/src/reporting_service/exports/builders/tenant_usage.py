"""Builder: tenant-usage / billing snapshot."""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ...models.reporting import TenantStats
from .base import BuilderResult


async def build_tenant_usage(
    session: AsyncSession, scope: dict[str, Any], options: dict[str, Any]
) -> BuilderResult:
    tenant_id = str(scope.get("tenant_id", ""))
    t = await session.get(TenantStats, tenant_id) if tenant_id else None
    rows: list[dict[str, Any]] = []
    if t is not None:
        rows.append(
            {
                "tenant_id": t.tenant_id,
                "active_courses": t.active_courses,
                "active_users": t.active_users,
                "submissions_30d": t.submissions_30d,
                "plagiarism_runs_30d": t.plagiarism_runs_30d,
                "ai_tokens_total_30d": t.ai_tokens_total_30d,
                "ai_cost_total_30d": round(t.ai_cost_total_30d, 4),
            }
        )
    columns = list(rows[0].keys()) if rows else ["tenant_id"]
    return BuilderResult(
        title="Tenant Usage",
        columns=columns,
        rows=rows,
        metadata={"tenant_id": tenant_id},
    )
