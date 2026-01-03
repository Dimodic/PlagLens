"""Operation status endpoints (Canvas-style async resource).

For AI Analysis Service the operation_id is the AIAnalysis id.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from ..deps import PrincipalDep, SessionDep
from ._helpers import auth_for_analysis, fetch_analysis

router = APIRouter(prefix="/api/v1")


def _operation_view(row) -> dict[str, Any]:
    progress_total = 1
    completed = 1 if row.status in {"completed", "failed", "cancelled"} else 0
    return {
        "id": row.id,
        "kind": "ai_analysis",
        "status": row.status,
        "progress": {
            "completed": completed,
            "total": progress_total,
            "percent": 100.0 if completed else 0.0,
        },
        "started_at": row.started_at,
        "updated_at": row.finished_at or row.created_at,
        "finished_at": row.finished_at,
        "result_url": f"/api/v1/ai-analyses/{row.id}",
        "error": (
            {"code": "ANALYSIS_FAILED", "detail": row.failure_reason}
            if row.status == "failed"
            else None
        ),
        "metadata": {
            "submission_id": row.submission_id,
            "provider": row.provider,
            "model": row.model,
            "prompt_version": row.prompt_version,
        },
    }


@router.get("/operations/{operation_id}")
async def get_operation(
    operation_id: str, principal: PrincipalDep, session: SessionDep
) -> dict[str, Any]:
    row = await fetch_analysis(session, operation_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    return _operation_view(row)


@router.post("/operations/{operation_id}:cancel")
async def cancel_operation(
    operation_id: str, principal: PrincipalDep, session: SessionDep
) -> JSONResponse:
    row = await fetch_analysis(session, operation_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    if row.status in {"completed", "cancelled", "failed"}:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": f"cannot cancel {row.status}"},
        )
    row.status = "cancelled"
    await session.commit()
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content=_operation_view(row),
    )
