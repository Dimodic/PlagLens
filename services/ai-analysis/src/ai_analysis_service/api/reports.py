"""Report endpoints (PlagLensReport + raw LLM)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from ..common.problem import not_found
from ..deps import PrincipalDep, SessionDep
from ..models import AIAnalysis
from ._helpers import auth_for_analysis, fetch_analysis

router = APIRouter(prefix="/api/v1")


@router.get("/ai-analyses/{analysis_id}/report")
async def get_report(
    analysis_id: str, principal: PrincipalDep, session: SessionDep
) -> dict[str, Any]:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    if row.report is None:
        raise not_found("report not generated yet")
    return row.report


@router.get("/submissions/{submission_id}/ai-report")
async def latest_report(
    submission_id: str, principal: PrincipalDep, session: SessionDep
) -> dict[str, Any]:
    stmt = (
        select(AIAnalysis)
        .where(
            AIAnalysis.submission_id == submission_id,
            AIAnalysis.tenant_id == principal.tenant_id,
            AIAnalysis.deleted_at.is_(None),
            AIAnalysis.report.is_not(None),
        )
        .order_by(AIAnalysis.created_at.desc())
        .limit(1)
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise not_found("no AI report for submission")
    auth_for_analysis(principal, row)
    return dict(row.report or {})


@router.get("/ai-analyses/{analysis_id}/raw-llm-response")
async def raw_response(
    analysis_id: str, principal: PrincipalDep, session: SessionDep
) -> dict[str, Any]:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    return {"id": row.id, "raw": row.raw_llm_response or ""}
