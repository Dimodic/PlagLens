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
    # match. Fall back to the global role: any teacher OR assistant passes —
    # assistants grade for the course, so they may export those grades too.
    if p.has_global("teacher", "assistant"):
        return
    raise forbidden("No course role")


@router.get("/sheets/{spreadsheet_id}/preview")
async def preview_spreadsheet(
    spreadsheet_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    max_rows: int = Query(default=200, ge=1, le=2000),
    max_cols: int = Query(default=40, ge=1, le=200),
    sheet_name: str | None = Query(default=None),
) -> dict[str, Any]:
    """Render a Google spreadsheet for the interactive picker, capped to
    ``max_rows × max_cols``. Pass ``sheet_name`` to fetch just one tab —
    a gradebook can have 20 wide tabs and pulling them all is slow.
    The service account must have read access (teacher shares it).
    """
    if not p.has_global("teacher", "admin", "assistant"):
        raise forbidden("Teacher, assistant or admin role required")
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
            spreadsheet_id,
            max_rows=max_rows,
            max_cols=max_cols,
            sheet_name=sheet_name,
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
    if not homework_ids or not spreadsheet_id:
        raise Problem(
            status=400,
            code="BAD_REQUEST",
            title="Недостаточно данных",
            detail="Нужны homework_ids и spreadsheet_id",
        )

    from ...exports.sheet_match import (
        build_homework_matrix,
        build_placements,
        detect_layout,
        llm_resolve_columns,
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
            spreadsheet_id, max_rows=1000, max_cols=160, sheet_name=sheet_name
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
    # Analyse the whole top of the sheet — find the real header row (it's
    # often below a banner / merged "ДЗ - N" labels), the ФИО + login
    # columns, and each ДЗ's *total* column inside its banner block.
    layout = detect_layout(rows_grid)
    header_row = layout["header_row"]
    header_cells = layout["header_cells"]
    name_col = layout["name_col"]
    login_col = layout["login_col"]
    name_cells = layout["name_cells"]
    login_cells = layout["login_cells"]

    bearer = request.headers.get("authorization")
    matrix = await build_homework_matrix(homework_ids, bearer)
    row_map = match_rows(matrix["students"], name_cells, login_cells)
    placements = build_placements(matrix, layout, row_map)

    # GS5 — for any homework the structural pass couldn't place at all, let
    # the LLM try to find a single total column, then re-place the sums.
    unplaced = [s for s in placements["summary"] if s["mode"] == "none"]
    if unplaced:
        resolved = await llm_resolve_columns(
            [{"homework_id": s["homework_id"], "title": s["title"]} for s in unplaced],
            header_cells,
            p.tenant_id,
        )
        injected = False
        for s in unplaced:
            col = resolved.get(s["homework_id"])
            if col is not None and s["number"] is not None:
                layout["dz_cols"][s["number"]] = col
                injected = True
        if injected:
            placements = build_placements(matrix, layout, row_map)

    students = [
        {
            "author_id": st["author_id"],
            "name": st["name"],
            "row_index": row_map.get(st["author_id"]),
        }
        for st in matrix["students"]
    ]
    return {
        "spreadsheet_id": spreadsheet_id,
        "sheet_name": ws.get("title"),
        "header_row": header_row,
        "name_col": name_col,
        "login_col": login_col,
        "header": [c["text"] for c in header_cells],
        "homeworks": placements["summary"],
        "placements": placements["cells"],
        "students": students,
        "matched_students": sum(1 for s in students if s["row_index"] is not None),
        "total_students": len(students),
        "unmatched_students": [
            s["name"] for s in students if s["row_index"] is None
        ],
        "unplaced_homeworks": [
            s["homework_id"] for s in placements["summary"] if s["mode"] == "none"
        ],
    }


@router.post("/courses/{course_id}/exports/google-sheets/grades-write")
async def grades_write(
    course_id: str,
    request: Request,
    body: dict[str, Any],
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Write grades into the linked sheet.

    Fast path: if the client passes ``cells`` (the exact placement
    «Предзаписать» already computed and the teacher just saw), they're
    written verbatim — no recompute, no double work.

    Fallback (direct «Записать» without a pre-write): the placement is
    recomputed server-side from the live sheet (each task → its A…J
    column, or a homework total → one column; "Итог"/"∑" untouched).
    Writes scattered cells — never a block."""
    _ensure_course_role(p, course_id)
    homework_ids = [str(h) for h in (body.get("homework_ids") or []) if h]
    spreadsheet_id = str(body.get("spreadsheet_id") or "").strip()
    sheet_name = str(body.get("sheet_name") or "").strip()
    client_cells = body.get("cells")
    if not spreadsheet_id or not sheet_name or (not homework_ids and not client_cells):
        raise Problem(
            status=400,
            code="BAD_REQUEST",
            title="Недостаточно данных",
            detail="Нужны spreadsheet_id, sheet_name и (homework_ids или cells)",
        )

    from ...exports.sheet_match import (
        build_homework_matrix,
        build_placements,
        detect_layout,
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

    if client_cells:
        # Pre-write path — write exactly what the teacher previewed.
        sheet_title = sheet_name
        cells = []
        for c in client_cells:
            try:
                cells.append(
                    {
                        "row": int(c["row"]),
                        "col": int(c["col"]),
                        "value": c.get("value"),
                    }
                )
            except (KeyError, TypeError, ValueError):
                continue
        students_written = {(c["row"]) for c in cells}
    else:
        # Re-read the sheet + re-run the same placement engine as preview.
        try:
            preview = await client.fetch_preview(
                spreadsheet_id, max_rows=1000, max_cols=160, sheet_name=sheet_name
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
        sheet_title = ws.get("title") or sheet_name
        layout = detect_layout(ws.get("rows") or [])
        bearer = request.headers.get("authorization")
        matrix = await build_homework_matrix(homework_ids, bearer)
        row_map = match_rows(
            matrix["students"], layout["name_cells"], layout["login_cells"]
        )
        placements = build_placements(matrix, layout, row_map)
        cells = [
            {"row": c["row"], "col": c["col"], "value": c["value"]}
            for c in placements["cells"]
        ]
        students_written = {c["author_id"] for c in placements["cells"]}

    try:
        res = (
            await client.write_cells(spreadsheet_id, sheet_title, cells)
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

    # Record the write in «История экспортов». The cells are already in the
    # sheet, so this is a pure audit row — best-effort: a history failure
    # must never surface as a write failure to the teacher.
    try:
        await request.app.state.export_service.record_sheets_grades(
            session,
            tenant_id=p.tenant_id,
            triggered_by=p.user_id,
            course_id=course_id,
            spreadsheet_id=spreadsheet_id,
            sheet_name=sheet_title,
            written_cells=len(cells),
            students_written=len(students_written),
            homework_ids=homework_ids,
            trace_id=getattr(request.state, "request_id", None),
        )
        await session.commit()
    except Exception:  # noqa: BLE001
        await session.rollback()

    return {
        "written_cells": len(cells),
        "students_written": len(students_written),
        "sheet_name": sheet_title,
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
