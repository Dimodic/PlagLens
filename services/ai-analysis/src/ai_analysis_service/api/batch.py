"""Batch endpoints (per-assignment)."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import func, select

from ..common.auth import require_teacher_or_assistant
from ..common.ids import gen_id
from ..common.pagination import Page, PageInfo, decode_cursor, encode_cursor
from ..db import get_session_factory
from ..deps import (
    CacheDep,
    PrincipalDep,
    PromptLoaderDep,
    ProviderFactoryDep,
    PublisherDep,
    SessionDep,
)
from ..models import AIAnalysis
from ..schemas import (
    AnalysisOut,
    BatchCreateRequest,
    BatchStats,
    OperationCreated,
)
from ..services.orchestrator import AnalysisRequest, Orchestrator
from ._helpers import to_analysis_out

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")

# Hold references to in-flight background batches so the event loop doesn't
# garbage-collect them mid-run.
_BG_TASKS: set[asyncio.Task] = set()


@router.post(
    "/assignments/{assignment_id}/ai-analyses:batchCreate",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=OperationCreated,
)
async def batch_create(
    assignment_id: str,
    body: BatchCreateRequest,
    principal: PrincipalDep,
    response: Response,
    cache: CacheDep,
    publisher: PublisherDep,
    factory: ProviderFactoryDep,
    loader: PromptLoaderDep,
    course_id: str | None = Query(default=None),
) -> OperationCreated:
    require_teacher_or_assistant(principal, course_id)
    op_id = gen_id("op")
    status_url = f"/api/v1/operations/{op_id}"
    submission_ids = body.submission_ids or []
    if not submission_ids:
        return OperationCreated(operation_id=op_id, status_url=status_url)

    # Capture plain values — the request scope (and its session) is gone once
    # we return 202 below.
    tenant_id = principal.tenant_id
    actor_id = principal.user_id
    prompt_version = body.prompt_version
    provider = body.provider

    async def _run() -> None:
        # Fresh session on its own task. Commit per-submission so the analyses
        # surface in the list one-by-one (live progress) and a single failure
        # never loses the rest.
        async with get_session_factory()() as bg:
            orch = Orchestrator(
                session=bg,
                cache=cache,
                publisher=publisher,
                provider_factory=factory,
                prompt_loader=loader,
            )
            for sid in submission_ids:
                try:
                    await orch.run_analysis(
                        AnalysisRequest(
                            tenant_id=tenant_id,
                            course_id=course_id,
                            assignment_id=assignment_id,
                            submission_id=sid,
                            code="",
                            language="plain",
                            prompt_version=prompt_version,
                            provider=provider,
                            force_no_cache=False,
                            trigger="auto",
                            actor_id=actor_id,
                        )
                    )
                    await bg.commit()
                except Exception:
                    logger.exception("batch analysis failed for submission=%s", sid)
                    await bg.rollback()

    task = asyncio.create_task(_run())
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)

    response.headers["Location"] = status_url
    return OperationCreated(operation_id=op_id, status_url=status_url)


@router.get(
    "/assignments/{assignment_id}/ai-analyses",
    response_model=Page[AnalysisOut],
)
async def list_for_assignment(
    assignment_id: str,
    principal: PrincipalDep,
    session: SessionDep,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> Page[AnalysisOut]:
    cursor_data = decode_cursor(cursor) or {}
    stmt = (
        select(AIAnalysis)
        .where(
            AIAnalysis.assignment_id == assignment_id,
            AIAnalysis.tenant_id == principal.tenant_id,
            AIAnalysis.deleted_at.is_(None),
        )
        .order_by(AIAnalysis.created_at.desc(), AIAnalysis.id.desc())
        .limit(limit + 1)
    )
    if last_id := cursor_data.get("id"):
        stmt = stmt.where(AIAnalysis.id < last_id)
    rows = list((await session.execute(stmt)).scalars())
    if not rows:
        return Page[AnalysisOut](data=[], pagination=PageInfo(limit=limit))
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
    "/assignments/{assignment_id}/ai-analyses/stats",
    response_model=BatchStats,
)
async def assignment_stats(
    assignment_id: str,
    principal: PrincipalDep,
    session: SessionDep,
    course_id: str | None = Query(default=None),
) -> BatchStats:
    require_teacher_or_assistant(principal, course_id)
    stmt = (
        select(
            AIAnalysis.status,
            AIAnalysis.cache_hit,
            func.count().label("c"),
            func.sum(AIAnalysis.total_tokens).label("tt"),
        )
        .where(
            AIAnalysis.assignment_id == assignment_id,
            AIAnalysis.tenant_id == principal.tenant_id,
            AIAnalysis.deleted_at.is_(None),
        )
        .group_by(AIAnalysis.status, AIAnalysis.cache_hit)
    )
    rows = list((await session.execute(stmt)).all())
    total = sum(int(r.c or 0) for r in rows)
    by_status = {"completed": 0, "failed": 0, "cancelled": 0, "queued": 0, "running": 0}
    cache_hits = 0
    total_tokens = 0
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + int(r.c or 0)
        if r.cache_hit:
            cache_hits += int(r.c or 0)
        total_tokens += int(r.tt or 0)
    avg_total = (total_tokens / total) if total else 0.0
    cache_rate = (cache_hits / total) if total else 0.0
    return BatchStats(
        total=total,
        completed=by_status["completed"],
        failed=by_status["failed"],
        cancelled=by_status["cancelled"],
        queued=by_status["queued"],
        running=by_status["running"],
        average_total_tokens=avg_total,
        cache_hit_rate=cache_rate,
    )
