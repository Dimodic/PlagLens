"""Google Sheets sync endpoints (§C)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.deps import get_session
from ...common.problem import Problem, forbidden
from ...common.rbac import Principal, get_principal
from ...common.time import iso

router = APIRouter(tags=["google-sheets"])


def _ensure_course_role(p: Principal, course_id: str) -> None:
    if p.has_global("super_admin", "admin"):
        return
    if p.has_course_role(course_id, "owner", "co_owner", "assistant"):
        return
    # JWT ``course_roles`` are empty by default — identity-service doesn't
    # populate them — so a teacher who owns the course has nothing to
    # match. Fall back to the global role: any teacher passes.
    if p.has_global("teacher"):
        return
    raise forbidden("No course role")


@router.get("/sheets/{spreadsheet_id}/preview")
async def preview_spreadsheet(
    spreadsheet_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    max_rows: int = Query(default=200, ge=1, le=2000),
    max_cols: int = Query(default=40, ge=1, le=200),
) -> dict[str, Any]:
    """Render a Google spreadsheet for the interactive picker — all
    worksheets, cell values + notes, capped to ``max_rows × max_cols`` so
    big sheets don't blow the payload. The service account must have read
    access to the spreadsheet (teacher shares it with the SA email).
    """
    if not p.has_global("teacher", "admin"):
        raise forbidden("Teacher or admin role required")
    # Prefer the teacher's own Google OAuth token (Iteration 2) if
    # they've connected their account. Else fall back to the admin's
    # tenant-level SA (Iteration 1). No credentials at all → honest 503.
    from ...services.sheets_sa_loader import get_sheets_client_for_user

    client = await get_sheets_client_for_user(p.tenant_id, p.user_id)
    if client is None:
        raise Problem(
            status=503,
            code="SHEETS_NOT_CONFIGURED",
            title="Google Sheets не подключён",
            detail=(
                "Админу: подключите Google Sheets в разделе «Интеграции» "
                "(загрузите Service Account JSON)."
            ),
        )
    try:
        return await client.fetch_preview(
            spreadsheet_id, max_rows=max_rows, max_cols=max_cols
        )
    except Exception as exc:  # noqa: BLE001
        raise Problem(
            status=400,
            code="SHEETS_PREVIEW_FAILED",
            title="Не удалось открыть таблицу",
            detail=str(exc)[:300],
        ) from exc


@router.post("/courses/{course_id}/exports/google-sheets/sync", status_code=202)
async def sync_course(
    course_id: str,
    request: Request,
    response: Response,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    _ensure_course_role(p, course_id)
    svc = request.app.state.export_service
    job = await svc.create(
        session,
        tenant_id=p.tenant_id,
        triggered_by=p.user_id,
        kind="course_summary",
        fmt="google_sheets",
        scope={"course_id": course_id, "spreadsheet_id": f"course-{course_id}-sheet"},
        options={},
        trace_id=getattr(request.state, "request_id", None),
    )
    await session.commit()
    import asyncio

    asyncio.create_task(svc.run_now(job.id))
    body = {
        "operation_id": job.operation_id,
        "spreadsheet_id": f"course-{course_id}-sheet",
        "sheet_titles": ["Course Summary"],
        "last_sync_at": None,
    }
    response.headers["Location"] = f"/api/v1/operations/{job.operation_id}"
    return body


@router.post("/assignments/{assignment_id}/exports/google-sheets/sync", status_code=202)
async def sync_assignment(
    assignment_id: str,
    request: Request,
    response: Response,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    svc = request.app.state.export_service
    job = await svc.create(
        session,
        tenant_id=p.tenant_id,
        triggered_by=p.user_id,
        kind="assignment_grades",
        fmt="google_sheets",
        scope={"assignment_id": assignment_id, "spreadsheet_id": f"assn-{assignment_id}-sheet"},
        options={},
        trace_id=getattr(request.state, "request_id", None),
    )
    await session.commit()
    import asyncio

    asyncio.create_task(svc.run_now(job.id))
    body = {
        "operation_id": job.operation_id,
        "spreadsheet_id": f"assn-{assignment_id}-sheet",
        "sheet_titles": ["Assignment Grades"],
        "last_sync_at": None,
    }
    response.headers["Location"] = f"/api/v1/operations/{job.operation_id}"
    return body


@router.get("/courses/{course_id}/exports/google-sheets/last-sync")
async def last_sync(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _ensure_course_role(p, course_id)
    sheets = request.app.state.sheets_client
    last = getattr(sheets, "last_sync_at", {}).get(f"course-{course_id}-sheet")
    return {
        "course_id": course_id,
        "last_sync_at": iso(last) if last else None,
    }
