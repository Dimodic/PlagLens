"""Analyses CRUD + retry/regenerate/cancel."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Header, Query, Response, status
from sqlalchemy import select

from ..common.events import build_event
from ..common.pagination import Page, PageInfo, decode_cursor, encode_cursor
from ..common.problem import conflict, validation
from ..deps import (
    IdempotencyDep,
    IdempotencyKeyDep,
    OrchestratorDep,
    PrincipalDep,
    PublisherDep,
    SessionDep,
)
from ..models import AIAnalysis
from ..schemas import (
    AnalysisOut,
    CreateAnalysisRequest,
    OperationCreated,
    RegenerateRequest,
)
from ..services.orchestrator import AnalysisRequest
from ._helpers import auth_for_analysis, fetch_analysis, to_analysis_out

router = APIRouter(prefix="/api/v1")


# ----------------------- POST submissions/{id}/ai-analyses ---------------

@router.post(
    "/submissions/{submission_id}/ai-analyses",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=OperationCreated,
)
async def create_analysis(
    submission_id: str,
    body: CreateAnalysisRequest,
    response: Response,
    principal: PrincipalDep,
    session: SessionDep,
    orchestrator: OrchestratorDep,
    idem_store: IdempotencyDep,
    idem_key: IdempotencyKeyDep,
    publisher: PublisherDep,
    course_id: str | None = Query(default=None, alias="course_id"),
    assignment_id: str | None = Query(default=None, alias="assignment_id"),
    language: str = Query(default="plain"),
    x_submission_code: str | None = Header(default=None, alias="X-Submission-Code"),
) -> OperationCreated:
    """Run analysis for a submission.

    Code is sourced from ``X-Submission-Code`` (test/dev) or fetched by the
    orchestrator (production deployment). An empty body is still wrapped in
    ``<student_code>...</student_code>`` and sent to the LLM.
    """
    from ..common.auth import require_teacher_or_assistant

    require_teacher_or_assistant(principal, course_id)

    if idem_key:
        cached = await idem_store.get(idem_key)
        if cached:
            cached_hash, cached_resp = cached
            new_hash = idem_store.hash_body(body.model_dump())
            if cached_hash != new_hash:
                raise conflict("Idempotency key reuse with different body", "IDEMPOTENCY_KEY_CONFLICT")
            return OperationCreated.model_validate(cached_resp)

    src_code = body.code or x_submission_code or ""
    req = AnalysisRequest(
        tenant_id=principal.tenant_id,
        course_id=course_id,
        assignment_id=assignment_id,
        submission_id=submission_id,
        code=src_code,
        language=language,
        assignment_title=body.assignment_title or "",
        assignment_description=body.assignment_description or "",
        prompt_version=body.prompt_version,
        provider=body.provider,
        force_no_cache=body.force_no_cache,
        trigger="manual",
        actor_id=principal.user_id,
    )
    try:
        analysis = await orchestrator.run_analysis(req)
    finally:
        await session.commit()

    op = OperationCreated(
        operation_id=analysis.id,
        status_url=f"/api/v1/ai-analyses/{analysis.id}",
    )
    response.headers["Location"] = op.status_url
    if idem_key:
        await idem_store.set(
            idem_key, idem_store.hash_body(body.model_dump()), op.model_dump()
        )
    return op


# ----------------------- GET submissions/{id}/ai-analyses ----------------

@router.get(
    "/submissions/{submission_id}/ai-analyses",
    response_model=Page[AnalysisOut],
)
async def list_for_submission(
    submission_id: str,
    principal: PrincipalDep,
    session: SessionDep,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    include_deleted: bool = Query(default=False),
) -> Page[AnalysisOut]:
    cursor_data = decode_cursor(cursor) or {}
    stmt = (
        select(AIAnalysis)
        .where(
            AIAnalysis.submission_id == submission_id,
            AIAnalysis.tenant_id == principal.tenant_id,
        )
        .order_by(AIAnalysis.created_at.desc(), AIAnalysis.id.desc())
        .limit(limit + 1)
    )
    if not include_deleted:
        stmt = stmt.where(AIAnalysis.deleted_at.is_(None))
    if (last_id := cursor_data.get("id")) is not None:
        stmt = stmt.where(AIAnalysis.id < last_id)
    rows = list((await session.execute(stmt)).scalars())
    if not rows:
        return Page[AnalysisOut](
            data=[], pagination=PageInfo(next_cursor=None, has_more=False, limit=limit)
        )

    # auth on first row's course
    from ..common.auth import require_teacher_or_assistant

    require_teacher_or_assistant(principal, rows[0].course_id)

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    next_cursor = encode_cursor({"id": rows[-1].id}) if has_more else None
    return Page[AnalysisOut](
        data=[to_analysis_out(r) for r in rows],
        pagination=PageInfo(next_cursor=next_cursor, has_more=has_more, limit=limit),
    )


@router.get(
    "/submissions/{submission_id}/ai-analyses/latest",
    response_model=AnalysisOut,
)
async def latest_for_submission(
    submission_id: str,
    principal: PrincipalDep,
    session: SessionDep,
) -> AnalysisOut:
    from ..common.problem import not_found

    stmt = (
        select(AIAnalysis)
        .where(
            AIAnalysis.submission_id == submission_id,
            AIAnalysis.tenant_id == principal.tenant_id,
            AIAnalysis.deleted_at.is_(None),
        )
        .order_by(AIAnalysis.created_at.desc())
        .limit(1)
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise not_found("no analysis for submission")
    auth_for_analysis(principal, row)
    return to_analysis_out(row)


@router.get("/ai-analyses/{analysis_id}", response_model=AnalysisOut)
async def get_analysis(
    analysis_id: str,
    principal: PrincipalDep,
    session: SessionDep,
) -> AnalysisOut:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    return to_analysis_out(row)


# ----------------------- :retry / :regenerate / :cancel ------------------

@router.post(
    "/ai-analyses/{analysis_id}:retry",
    response_model=AnalysisOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_analysis(
    analysis_id: str,
    principal: PrincipalDep,
    session: SessionDep,
    orchestrator: OrchestratorDep,
    response: Response,
    code: str | None = Header(default=None, alias="X-Submission-Code"),
    language: str = Query(default="plain"),
) -> AnalysisOut:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    if row.status not in {"failed", "cancelled"}:
        raise validation("Only failed/cancelled analyses can be retried")
    req = AnalysisRequest(
        tenant_id=row.tenant_id,
        course_id=row.course_id,
        assignment_id=row.assignment_id,
        submission_id=row.submission_id,
        code=code or "",
        language=language,
        prompt_version=row.prompt_version,
        provider=row.provider,
        force_no_cache=False,
        trigger="manual",
        actor_id=principal.user_id,
        parent_analysis_id=row.id,
    )
    new_row = await orchestrator.run_analysis(req)
    await session.commit()
    response.headers["Location"] = f"/api/v1/ai-analyses/{new_row.id}"
    return to_analysis_out(new_row)


@router.post(
    "/ai-analyses/{analysis_id}:regenerate",
    response_model=AnalysisOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def regenerate_analysis(
    analysis_id: str,
    body: RegenerateRequest,
    principal: PrincipalDep,
    session: SessionDep,
    orchestrator: OrchestratorDep,
    response: Response,
    code: str | None = Header(default=None, alias="X-Submission-Code"),
    language: str = Query(default="plain"),
) -> AnalysisOut:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    req = AnalysisRequest(
        tenant_id=row.tenant_id,
        course_id=row.course_id,
        assignment_id=row.assignment_id,
        submission_id=row.submission_id,
        code=code or "",
        language=language,
        prompt_version=body.prompt_version or row.prompt_version,
        provider=body.provider or row.provider,
        force_no_cache=body.force_no_cache,
        trigger="regenerate",
        actor_id=principal.user_id,
        parent_analysis_id=row.id,
    )
    new_row = await orchestrator.run_analysis(req)
    await session.commit()
    response.headers["Location"] = f"/api/v1/ai-analyses/{new_row.id}"
    return to_analysis_out(new_row)


@router.post(
    "/ai-analyses/{analysis_id}:cancel",
    response_model=AnalysisOut,
)
async def cancel_analysis(
    analysis_id: str,
    principal: PrincipalDep,
    session: SessionDep,
    publisher: PublisherDep,
) -> AnalysisOut:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    if row.status in {"completed", "failed", "cancelled"}:
        raise conflict(f"cannot cancel analysis in status {row.status}")
    row.status = "cancelled"
    row.finished_at = datetime.now(UTC)
    await session.commit()
    await publisher.publish(
        build_event(
            "ai.analysis.failed.v1",
            tenant_id=row.tenant_id,
            subject=f"ai-analyses/{row.id}",
            data={"analysis_id": row.id, "reason": "cancelled"},
        )
    )
    return to_analysis_out(row)


@router.delete(
    "/ai-analyses/{analysis_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_analysis(
    analysis_id: str,
    principal: PrincipalDep,
    session: SessionDep,
) -> Response:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    row.deleted_at = datetime.now(UTC)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
