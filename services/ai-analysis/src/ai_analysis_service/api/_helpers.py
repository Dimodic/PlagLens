"""Shared helpers for API routers."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.auth import Principal, require_admin, require_teacher_or_assistant
from ..common.problem import not_found
from ..models import AIAnalysis
from ..schemas import AnalysisOut


def to_analysis_out(row: AIAnalysis) -> AnalysisOut:
    return AnalysisOut(
        id=row.id,
        tenant_id=row.tenant_id,
        course_id=row.course_id,
        assignment_id=row.assignment_id,
        submission_id=row.submission_id,
        prompt_version=row.prompt_version,
        provider=row.provider,
        model=row.model,
        status=row.status,
        trigger=row.trigger,
        cache_hit=row.cache_hit,
        injection_suspected=row.injection_suspected,
        prompt_tokens=row.prompt_tokens,
        completion_tokens=row.completion_tokens,
        total_tokens=row.total_tokens,
        cost_estimate=row.cost_estimate,
        currency=row.currency,
        latency_ms=row.latency_ms,
        parent_analysis_id=row.parent_analysis_id,
        failure_reason=row.failure_reason,
        shared_with_student=row.shared_with_student,
        curated_feedback_id=row.curated_feedback_id,
        started_at=row.started_at,
        finished_at=row.finished_at,
        created_at=row.created_at,
        report=row.report,
    )


async def fetch_analysis(
    session: AsyncSession,
    analysis_id: str,
    tenant_id: str,
    *,
    include_deleted: bool = False,
) -> AIAnalysis:
    stmt = select(AIAnalysis).where(
        AIAnalysis.id == analysis_id, AIAnalysis.tenant_id == tenant_id
    )
    if not include_deleted:
        stmt = stmt.where(AIAnalysis.deleted_at.is_(None))
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise not_found(f"analysis {analysis_id} not found")
    return row


def auth_for_analysis(principal: Principal, row: AIAnalysis) -> None:
    require_teacher_or_assistant(principal, row.course_id)


def auth_admin(principal: Principal) -> None:
    require_admin(principal)


def headers_for_async(operation_id: str) -> dict[str, Any]:
    status_url = f"/api/v1/operations/{operation_id}"
    return {"Location": status_url}
