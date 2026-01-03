"""Exports endpoints (§A, §B): create / read / retry / cancel / download."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.deps import get_audit_proxy, get_session
from ...common.problem import Problem, forbidden, not_found
from ...common.rbac import Principal, get_principal, require_global
from ...repositories.export_jobs import ExportJobRepo
from ...schemas.exports import ExportCreateRequest

router = APIRouter(tags=["exports"])


def _ensure_course_access(p: Principal, course_id: str | None) -> None:
    if course_id is None:
        return
    if p.has_global("super_admin", "admin"):
        return
    if p.has_course_role(course_id, "owner", "co_owner", "assistant"):
        return
    # JWT ``course_roles`` are empty by default — identity-service doesn't
    # populate them yet — so a teacher who clearly owns the course still
    # has nothing here. Fall back to the global role: any teacher passes,
    # and the downstream builder forwards the same token to the course /
    # submission services which re-check ownership at the data layer.
    if p.has_global("teacher"):
        return
    raise forbidden("No course role")


@router.post("/exports/preview-grades")
async def preview_assignment_grades(
    payload: dict[str, Any],
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Dry-run the ``assignment_grades`` builder and hand back the
    resulting matrix as JSON. Lets the teacher SEE the rows that
    would land in the target sheet before they hit «Записать в
    таблицу» — the front-end paints them into the Univer preview at
    the chosen anchor cell.

    Body shape mirrors ``ExportCreateRequest.scope``:
        ``{ "course_id": "...", "homework_ids": ["..."] }``
    Returns ``{ "columns": [...], "rows": [...], "cell_notes": [...] }``.
    """
    course_id = payload.get("course_id")
    _ensure_course_access(p, str(course_id) if course_id else None)
    homework_ids = payload.get("homework_ids") or []
    if not isinstance(homework_ids, list) or not homework_ids:
        raise Problem(
            status=400,
            code="BAD_REQUEST",
            title="homework_ids обязателен",
            detail="Передайте список homework_ids — что превьюить.",
        )
    scope: dict[str, Any] = {
        "course_id": course_id,
        "homework_ids": homework_ids,
    }
    options = payload.get("options") or {}
    bearer = request.headers.get("authorization")
    if not bearer:
        raise Problem(
            status=401,
            code="UNAUTHENTICATED",
            title="Нет токена",
            detail="Preview работает только под авторизованным пользователем.",
        )
    # Reuse the same builder the real export uses — same shape, same
    # column ordering, same cell_notes. Just don't persist a job.
    from ...exports.builders.assignment_grades import build_assignment_grades

    try:
        result = await build_assignment_grades(
            session, scope, options, bearer_token=bearer
        )
    except RuntimeError as exc:
        raise Problem(
            status=502,
            code="PREVIEW_FAILED",
            title="Не удалось собрать превью",
            detail=str(exc)[:300],
        ) from exc
    return {
        "title": result.title,
        "columns": result.columns,
        "rows": result.rows,
        "cell_notes": result.cell_notes,
        "metadata": result.metadata,
    }


@router.post("/exports", status_code=202)
async def create_generic_export(
    payload: ExportCreateRequest,
    request: Request,
    response: Response,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    course_id = payload.scope.get("course_id")
    _ensure_course_access(p, str(course_id) if course_id else None)
    if payload.kind == "tenant_usage" and not p.has_global("admin", "super_admin"):
        raise forbidden("Tenant usage requires admin")
    if payload.kind == "audit_log" and not p.has_global("admin", "super_admin"):
        raise forbidden("Audit export requires admin")
    return await _create_export(
        request,
        response,
        session,
        p,
        kind=payload.kind,
        fmt=payload.format,
        scope=payload.scope,
        options=payload.options.model_dump(),
        idem_key=idempotency_key,
    )


@router.post("/courses/{course_id}/exports", status_code=202)
async def create_course_export(
    course_id: str,
    payload: ExportCreateRequest,
    request: Request,
    response: Response,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    _ensure_course_access(p, course_id)
    scope = {**payload.scope, "course_id": course_id}
    return await _create_export(
        request, response, session, p,
        kind=payload.kind, fmt=payload.format, scope=scope,
        options=payload.options.model_dump(), idem_key=idempotency_key,
    )


@router.post("/assignments/{assignment_id}/exports", status_code=202)
async def create_assignment_export(
    assignment_id: str,
    payload: ExportCreateRequest,
    request: Request,
    response: Response,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    course_id = payload.scope.get("course_id")
    _ensure_course_access(p, str(course_id) if course_id else None)
    scope = {**payload.scope, "assignment_id": assignment_id}
    return await _create_export(
        request, response, session, p,
        kind=payload.kind, fmt=payload.format, scope=scope,
        options=payload.options.model_dump(), idem_key=idempotency_key,
    )


@router.post("/plagiarism-runs/{run_id}/exports", status_code=202)
async def create_plagiarism_export(
    run_id: str,
    payload: ExportCreateRequest,
    request: Request,
    response: Response,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    course_id = payload.scope.get("course_id")
    _ensure_course_access(p, str(course_id) if course_id else None)
    scope = {**payload.scope, "plagiarism_run_id": run_id}
    return await _create_export(
        request, response, session, p,
        kind=payload.kind or "plagiarism_report", fmt=payload.format,
        scope=scope, options=payload.options.model_dump(), idem_key=idempotency_key,
    )


@router.post("/admin/exports/audit", status_code=202)
async def create_audit_export(
    payload: ExportCreateRequest,
    request: Request,
    response: Response,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
    audit_proxy=Depends(get_audit_proxy),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    entries = await audit_proxy.export_window(p.tenant_id)
    scope = {**payload.scope, "entries": entries}
    return await _create_export(
        request, response, session, p,
        kind="audit_log", fmt=payload.format, scope=scope,
        options=payload.options.model_dump(), idem_key=idempotency_key,
    )


@router.post("/admin/exports/tenant-usage", status_code=202)
async def create_tenant_usage_export(
    payload: ExportCreateRequest,
    request: Request,
    response: Response,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    scope = {**payload.scope, "tenant_id": p.tenant_id}
    return await _create_export(
        request, response, session, p,
        kind="tenant_usage", fmt=payload.format, scope=scope,
        options=payload.options.model_dump(), idem_key=idempotency_key,
    )


async def _create_export(
    request: Request,
    response: Response,
    session: AsyncSession,
    p: Principal,
    *,
    kind: str,
    fmt: str,
    scope: dict[str, Any],
    options: dict[str, Any],
    idem_key: str | None,
) -> dict[str, Any]:
    # Refuse Google-Sheets-target exports up-front when neither the
    # teacher's own OAuth integration nor the admin's tenant SA is
    # available. Cheap (60s cache for SA + a single s2s probe for OAuth)
    # and honest — otherwise the job would just fail later with a less
    # obvious error.
    if fmt == "google_sheets":
        from ...services.sheets_sa_loader import get_sheets_client_for_user

        probe = await get_sheets_client_for_user(p.tenant_id, p.user_id)
        if probe is None:
            raise Problem(
                status=503,
                code="SHEETS_NOT_CONFIGURED",
                title="Google Sheets не подключён",
                detail=(
                    "Подключите Google в «Интеграциях» (ваш Google-аккаунт "
                    "через «Подключить») — или попросите админа залить "
                    "Service Account JSON для общего использования. "
                    "Сейчас доступен только CSV-экспорт."
                ),
            )
    idem = request.app.state.idempotency
    body_for_hash = {"kind": kind, "format": fmt, "scope": scope, "options": options}
    pre = await idem.lookup_or_record(p.tenant_id, idem_key, body_for_hash)
    if pre.cached and pre.body:
        response.status_code = 202
        return pre.body
    svc = request.app.state.export_service
    job = await svc.create(
        session,
        tenant_id=p.tenant_id,
        triggered_by=p.user_id,
        kind=kind,
        fmt=fmt,
        scope=scope,
        options=options,
        trace_id=getattr(request.state, "request_id", None),
    )
    await session.commit()
    # Forward the caller's bearer token into the (immediately-spawned)
    # worker. The grades builder uses it to fetch live per-student grades +
    # comments from the course / submission services as the teacher who
    # triggered the export — no service-account token needed. The token is
    # never persisted: it only rides the in-process ``run_now`` call.
    bearer = request.headers.get("authorization")
    asyncio.create_task(svc.run_now(job.id, bearer_token=bearer))
    op = svc.to_operation(job)
    body = {
        "operation_id": job.operation_id,
        "status_url": f"/api/v1/operations/{job.operation_id}",
        "export_id": job.id,
        "operation": op,
    }
    response.headers["Location"] = body["status_url"]
    await idem.store_response(p.tenant_id, idem_key, body_for_hash, body)
    return body


@router.get("/exports")
async def list_my_exports(
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    kind: str | None = Query(default=None),
    status: str | None = Query(default=None),
    course_id: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    repo = ExportJobRepo(session)
    triggered_by = None if p.has_global("admin", "super_admin") else p.user_id
    page = await repo.list(
        p.tenant_id,
        triggered_by=triggered_by,
        course_id=course_id,
        kind=kind,
        status=status,
        cursor=cursor,
        limit=limit,
    )
    svc = request.app.state.export_service
    return {
        "data": [svc.to_read(j) for j in page.data],
        "pagination": page.pagination.model_dump(),
    }


@router.get("/courses/{course_id}/exports")
async def list_course_exports(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    _ensure_course_access(p, course_id)
    repo = ExportJobRepo(session)
    page = await repo.list(p.tenant_id, course_id=course_id, cursor=cursor, limit=limit)
    svc = request.app.state.export_service
    return {
        "data": [svc.to_read(j) for j in page.data],
        "pagination": page.pagination.model_dump(),
    }


@router.get("/exports/{export_id}")
async def get_export(
    export_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    repo = ExportJobRepo(session)
    job = await repo.get(p.tenant_id, export_id)
    if job is None:
        raise not_found(f"Export {export_id} not found")
    if not p.has_global("admin", "super_admin") and job.triggered_by != p.user_id:
        cid = job.scope.get("course_id") if job.scope else None
        if not cid or not p.has_course_role(cid, "owner", "co_owner", "assistant"):
            raise forbidden("Not allowed")
    svc = request.app.state.export_service
    return svc.to_read(job)


@router.delete("/exports/{export_id}", status_code=204)
async def delete_export(
    export_id: str,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    repo = ExportJobRepo(session)
    job = await repo.get(p.tenant_id, export_id)
    if job is None:
        raise not_found(f"Export {export_id} not found")
    if not p.has_global("admin", "super_admin") and job.triggered_by != p.user_id:
        raise forbidden("Only initiator/admin can delete")
    await repo.soft_delete(job)
    await session.commit()
    return Response(status_code=204)


@router.post("/exports/{export_id}:retry", status_code=202)
async def retry_export(
    export_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    svc = request.app.state.export_service
    job = await svc.retry(session, p.tenant_id, export_id)
    if not p.has_global("admin", "super_admin") and job.triggered_by != p.user_id:
        raise forbidden("Only initiator/admin can retry")
    await session.commit()
    bearer = request.headers.get("authorization")
    asyncio.create_task(svc.run_now(job.id, bearer_token=bearer))
    return {"operation_id": job.operation_id, "status_url": f"/api/v1/operations/{job.operation_id}"}


@router.post("/exports/{export_id}:cancel", status_code=202)
async def cancel_export(
    export_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    svc = request.app.state.export_service
    job = await svc.cancel(session, p.tenant_id, export_id)
    if not p.has_global("admin", "super_admin") and job.triggered_by != p.user_id:
        raise forbidden("Only initiator/admin can cancel")
    await session.commit()
    return {"operation_id": job.operation_id, "status": "cancelled"}


@router.get("/exports/{export_id}/download")
async def download_export(
    export_id: str = Path(...),
    request: Request = None,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    svc = request.app.state.export_service
    repo = ExportJobRepo(session)
    job = await repo.get(p.tenant_id, export_id)
    if job is None:
        raise not_found(f"Export {export_id} not found")
    if not p.has_global("admin", "super_admin") and job.triggered_by != p.user_id:
        cid = job.scope.get("course_id") if job.scope else None
        if not cid or not p.has_course_role(cid, "owner", "co_owner", "assistant"):
            raise forbidden("Not allowed")
    return await svc.download(session, p.tenant_id, export_id)
