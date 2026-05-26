"""§A — runs CRUD + cancel/retry endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Path, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.idempotency import IdempotencyStore
from ...common.pagination import PageInfo, decode_cursor, encode_cursor
from ...common.problem import conflict, not_found
from ...common.rbac import Principal, assert_course_role, assert_tenant
from ...models.plagiarism import PlagiarismRun
from ...repositories.run_repo import RunRepository
from ...schemas.runs import RunCreate, RunDetail, RunListItem
from ...services.orchestrator import Orchestrator
from ...services.submission_fetcher import get_submission_fetcher
from ..deps import (
    get_db,
    get_idempotency_store,
    get_orchestrator,
    get_principal_dep,
)

router = APIRouter(tags=["runs"])


def _to_list_item(run: PlagiarismRun) -> RunListItem:
    return RunListItem(
        id=run.id,
        tenant_id=run.tenant_id,
        course_id=run.course_id,
        assignment_id=run.assignment_id,
        provider=run.provider,
        status=run.status,  # type: ignore[arg-type]
        trigger=run.trigger,
        submissions_count=run.submissions_count,
        pairs_total=run.pairs_total,
        pairs_suspected=run.pairs_suspected,
        max_similarity=run.max_similarity,
        started_at=run.started_at,
        finished_at=run.finished_at,
        created_at=run.created_at,
    )


def _to_detail(run: PlagiarismRun) -> RunDetail:
    base = _to_list_item(run).model_dump()
    return RunDetail(
        **base,
        scope=run.scope or {},
        options=run.options or {},
        triggered_by=run.triggered_by,
        error=run.error,
        artifacts={
            "html_url": (
                f"/api/v1/plagiarism-runs/{run.id}/artifacts/html"
                if run.artifact_html_uri
                else None
            ),
            "json_url": (
                f"/api/v1/plagiarism-runs/{run.id}/artifacts/json"
                if run.artifact_json_uri
                else None
            ),
            "archive_url": (
                f"/api/v1/plagiarism-runs/{run.id}/artifacts/archive"
                if run.artifact_archive_uri
                else None
            ),
        },
    )


@router.post(
    "/assignments/{assignment_id}/plagiarism-runs",
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_run(
    assignment_id: str,
    body: RunCreate,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    orch: Orchestrator = Depends(get_orchestrator),
    idem: IdempotencyStore = Depends(get_idempotency_store),
) -> JSONResponse:
    # Frontend dispatches without ?course_id= (we only know assignment_id
    # from the submission page URL). Try to derive course_id from the
    # assignment's first submission so the RBAC check below has something
    # to match against. If the lookup fails, we fall back to the original
    # behaviour (assert_course_role raises 403 for non-admins).
    if not course_id:
        try:
            sub_ids = await get_submission_fetcher().list_latest_per_student(
                tenant_id=principal.tenant_id,
                assignment_id=assignment_id,
            )
            if sub_ids:
                probe = await get_submission_fetcher().fetch_one(
                    tenant_id=principal.tenant_id, submission_id=sub_ids[0]
                )
                if probe and probe.course_id:
                    course_id = probe.course_id
        except Exception:  # noqa: BLE001
            pass
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    body_payload: dict[str, Any] = body.model_dump()
    body_hash = IdempotencyStore.hash_body(body_payload)
    if idempotency_key:
        prev = await idem.get(idempotency_key)
        if prev is not None:
            stored_hash, response = prev
            if stored_hash != body_hash:
                raise conflict("Same Idempotency-Key with a different body", code="IDEMPOTENCY_KEY_CONFLICT")
            return JSONResponse(status_code=202, content=response)

    # If the caller didn't name specific submissions, auto-populate from
    # the assignment's latest-per-student feed. Without this the run is
    # queued with an empty scope.submission_ids and the scheduler never
    # starts it — the UI just sees "Плагиат не проверялся" forever.
    explicit_ids = list(body.submission_ids or [])
    if not explicit_ids:
        try:
            explicit_ids = await get_submission_fetcher().list_latest_per_student(
                tenant_id=principal.tenant_id,
                assignment_id=assignment_id,
            )
        except Exception:  # noqa: BLE001
            # Fallback to empty — the run will be marked failed by the
            # scheduler with a clear EMPTY_SCOPE reason rather than
            # crashing the API request.
            explicit_ids = []
    scope = {
        "assignment_ids": [assignment_id],
        "with_corpus": bool(body.with_corpus),
        "submission_ids": explicit_ids,
    }
    # Default provider — Dolos is the only adapter we ship. Without this
    # fallback the registry would reject the unset value and a teacher
    # who pressed "Запустить проверку" without picking an engine would
    # see the run flip to ``failed`` immediately.
    provider = body.provider or "dolos"
    run, replayed = await orch.enqueue_run(
        tenant_id=principal.tenant_id,
        course_id=course_id,
        assignment_id=assignment_id,
        provider_name=provider,
        scope=scope,
        options=body.options,
        triggered_by=principal.user_id,
    )
    payload = {
        "operation_id": run.id,
        "status_url": f"/api/v1/plagiarism-runs/{run.id}",
    }
    if idempotency_key:
        await idem.set(idempotency_key, body_hash, payload)
    response = JSONResponse(
        status_code=202,
        content=payload,
        headers={"Location": payload["status_url"]},
    )
    return response


@router.get("/assignments/{assignment_id}/plagiarism-runs")
async def list_runs_by_assignment(
    assignment_id: str,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
    course_id: str | None = Query(default=None),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    repo = RunRepository(db)
    parsed = decode_cursor(cursor)
    rows = await repo.list_by_assignment(
        tenant_id=principal.tenant_id,
        assignment_id=assignment_id,
        limit=limit,
        cursor_id=parsed.get("id") if parsed else None,
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = encode_cursor({"id": rows[-1].id}) if has_more and rows else None
    return {
        "data": [_to_list_item(r).model_dump() for r in rows],
        "pagination": PageInfo(next_cursor=next_cursor, has_more=has_more, limit=limit).model_dump(),
    }


@router.get("/courses/{course_id}/plagiarism-runs")
async def list_runs_by_course(
    course_id: str,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    repo = RunRepository(db)
    parsed = decode_cursor(cursor)
    rows = await repo.list_by_course(
        tenant_id=principal.tenant_id,
        course_id=course_id,
        limit=limit,
        cursor_id=parsed.get("id") if parsed else None,
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = encode_cursor({"id": rows[-1].id}) if has_more and rows else None
    return {
        "data": [_to_list_item(r).model_dump() for r in rows],
        "pagination": PageInfo(next_cursor=next_cursor, has_more=has_more, limit=limit).model_dump(),
    }


@router.get("/plagiarism-runs/{run_id}", response_model=RunDetail)
async def get_run(
    run_id: str = Path(...),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> RunDetail:
    repo = RunRepository(db)
    run = await repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_tenant(principal, run.tenant_id)
    return _to_detail(run)


@router.post("/plagiarism-runs/{run_id}:cancel", status_code=202)
async def cancel_run(
    run_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
    orch: Orchestrator = Depends(get_orchestrator),
) -> dict[str, Any]:
    repo = RunRepository(db)
    run = await repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))
    ok = await orch.cancel_run(run_id, by=principal.user_id)
    if not ok:
        raise conflict("Run is not cancellable in current state")
    return {"run_id": run_id, "status": "cancelling"}


@router.post("/plagiarism-runs/{run_id}:retry", status_code=202)
async def retry_run(
    run_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
    orch: Orchestrator = Depends(get_orchestrator),
) -> dict[str, Any]:
    repo = RunRepository(db)
    run = await repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))
    new_run = await orch.retry_run(run_id)
    if new_run is None:
        raise conflict("Only failed runs can be retried")
    return {
        "run_id": new_run.id,
        "retried_from": run_id,
        "status_url": f"/api/v1/plagiarism-runs/{new_run.id}",
    }


@router.delete("/plagiarism-runs/{run_id}", status_code=204)
async def delete_run(
    run_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = RunRepository(db)
    run = await repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner"))
    await repo.soft_delete(run_id)
    await db.commit()
