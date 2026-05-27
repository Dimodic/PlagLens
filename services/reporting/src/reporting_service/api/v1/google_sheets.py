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
    if p.has_global("admin",):
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


def _pick_worksheet(
    worksheets: list[dict[str, Any]], name: Any
) -> dict[str, Any] | None:
    """The tab to write into: the one whose title matches ``name``
    (case-insensitive), or the first tab when no name is given."""
    if not worksheets:
        return None
    if name:
        target = str(name).strip().casefold()
        for ws in worksheets:
            if str(ws.get("title", "")).strip().casefold() == target:
                return ws
        return None
    return worksheets[0]


@router.post("/courses/{course_id}/exports/google-sheets/grades-match")
async def grades_match_preview(
    course_id: str,
    request: Request,
    body: dict[str, Any],
    p: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """Propose where each ДЗ's grades should land in the course's linked
    sheet: ДЗ → header column (by number), student → row (by ФИО). The
    teacher reviews/edits this before the write (GS4) commits. Reads the
    sheet live; never writes."""
    _ensure_course_role(p, course_id)
    homework_ids = [str(h) for h in (body.get("homework_ids") or []) if h]
    spreadsheet_id = str(body.get("spreadsheet_id") or "").strip()
    sheet_name = body.get("sheet_name")
    header_row = int(body.get("header_row") or 0)
    name_col = int(body.get("name_col") or 0)
    if not homework_ids or not spreadsheet_id:
        raise Problem(
            status=400,
            code="BAD_REQUEST",
            title="Недостаточно данных",
            detail="Нужны homework_ids и spreadsheet_id",
        )

    from ...exports.sheet_match import (
        build_homework_matrix,
        llm_resolve_columns,
        match_columns,
        match_rows,
    )
    from ...services.sheets_sa_loader import get_sheets_client_for_user

    client = await get_sheets_client_for_user(p.tenant_id, p.user_id)
    if client is None:
        raise Problem(
            status=503,
            code="SHEETS_NOT_CONFIGURED",
            title="Google Sheets не подключён",
            detail="Админу: подключите Google Sheets в разделе «Интеграции».",
        )
    try:
        preview = await client.fetch_preview(
            spreadsheet_id, max_rows=1000, max_cols=80
        )
    except Exception as exc:  # noqa: BLE001
        raise Problem(
            status=400,
            code="SHEETS_PREVIEW_FAILED",
            title="Не удалось открыть таблицу",
            detail=str(exc)[:300],
        ) from exc

    ws = _pick_worksheet(preview.get("worksheets") or [], sheet_name)
    if ws is None:
        raise Problem(
            status=404,
            code="SHEET_TAB_NOT_FOUND",
            title="Лист не найден",
            detail=f"В таблице нет листа «{sheet_name}».",
        )
    rows_grid: list[list[dict[str, Any]]] = ws.get("rows") or []
    header = rows_grid[header_row] if len(rows_grid) > header_row else []
    header_cells = [
        {"index": i, "text": (c or {}).get("v")} for i, c in enumerate(header)
    ]
    name_cells = [
        {
            "index": r,
            "text": (row[name_col] or {}).get("v") if len(row) > name_col else "",
        }
        for r, row in enumerate(rows_grid)
        if r != header_row
    ]

    bearer = request.headers.get("authorization")
    matrix = await build_homework_matrix(homework_ids, bearer)
    columns = match_columns(matrix["homeworks"], header_cells)

    # GS5 hook — let the LLM try the homeworks the number heuristic missed.
    missing = [c for c in columns if c["column_index"] is None]
    if missing:
        resolved = await llm_resolve_columns(missing, header_cells, p.tenant_id)
        for c in columns:
            ci = resolved.get(c["homework_id"])
            if c["column_index"] is None and ci is not None:
                c["column_index"] = ci
                c["header_text"] = next(
                    (h["text"] for h in header_cells if h["index"] == ci), None
                )
                c["source"] = "llm"
                c["confidence"] = "medium"

    row_map = match_rows(matrix["students"], name_cells)
    students = [
        {
            "author_id": st["author_id"],
            "name": st["name"],
            "row_index": row_map.get(st["author_id"]),
            "values": st["totals"],
        }
        for st in matrix["students"]
    ]
    return {
        "spreadsheet_id": spreadsheet_id,
        "sheet_name": ws.get("title"),
        "header_row": header_row,
        "name_col": name_col,
        "header": [c["text"] for c in header_cells],
        "columns": columns,
        "students": students,
        "unmatched_homeworks": [
            c["homework_id"] for c in columns if c["column_index"] is None
        ],
        "unmatched_students": [
            s["author_id"] for s in students if s["row_index"] is None
        ],
    }


@router.post("/courses/{course_id}/exports/google-sheets/grades-write")
async def grades_write(
    course_id: str,
    request: Request,
    body: dict[str, Any],
    p: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """Write grades into the linked sheet using the teacher-confirmed
    placement. ``column_map`` (``{homework_id: col_index}``) and
    ``row_map`` (``{author_id: row_index}``) come from the match preview
    after any manual fixes; the *values* are re-fetched server-side, so
    only the placement is client-supplied. Writes scattered cells —
    never overwrites a block."""
    _ensure_course_role(p, course_id)
    homework_ids = [str(h) for h in (body.get("homework_ids") or []) if h]
    spreadsheet_id = str(body.get("spreadsheet_id") or "").strip()
    sheet_name = str(body.get("sheet_name") or "").strip()
    column_map = {
        str(k): int(v)
        for k, v in (body.get("column_map") or {}).items()
        if v is not None
    }
    row_map = {
        str(k): int(v)
        for k, v in (body.get("row_map") or {}).items()
        if v is not None
    }
    if not homework_ids or not spreadsheet_id or not sheet_name:
        raise Problem(
            status=400,
            code="BAD_REQUEST",
            title="Недостаточно данных",
            detail="Нужны homework_ids, spreadsheet_id и sheet_name",
        )

    from ...exports.sheet_match import build_homework_matrix
    from ...services.sheets_sa_loader import get_sheets_client_for_user

    client = await get_sheets_client_for_user(p.tenant_id, p.user_id)
    if client is None:
        raise Problem(
            status=503,
            code="SHEETS_NOT_CONFIGURED",
            title="Google Sheets не подключён",
            detail="Админу: подключите Google Sheets в разделе «Интеграции».",
        )

    bearer = request.headers.get("authorization")
    matrix = await build_homework_matrix(homework_ids, bearer)
    cells: list[dict[str, Any]] = []
    students_written: set[str] = set()
    for st in matrix["students"]:
        r = row_map.get(st["author_id"])
        if r is None:
            continue
        for hw_id, val in st["totals"].items():
            col = column_map.get(hw_id)
            if col is None or val is None:
                continue
            cells.append({"row": r, "col": col, "value": val})
            students_written.add(st["author_id"])

    try:
        res = (
            await client.write_cells(spreadsheet_id, sheet_name, cells)
            if cells
            else {"updated_cells": 0}
        )
    except Exception as exc:  # noqa: BLE001
        raise Problem(
            status=400,
            code="SHEETS_WRITE_FAILED",
            title="Не удалось записать в таблицу",
            detail=str(exc)[:300],
        ) from exc

    return {
        "written_cells": len(cells),
        "students_written": len(students_written),
        "sheet_name": sheet_name,
        "response": res,
    }


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
