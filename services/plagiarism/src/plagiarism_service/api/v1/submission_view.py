"""§C — per-submission view (incl. student-only %)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.rbac import (
    Principal,
    assert_course_role,
    assert_self_or_role,
    assert_tenant,
)
from ...repositories.pair_repo import PairRepository
from ...repositories.run_repo import RunRepository
from ...schemas.submission_view import (
    SubmissionPercentage,
    SubmissionPlagiarismLatest,
)
from ..deps import get_db, get_principal_dep

router = APIRouter(tags=["submission-view"])


@router.get(
    "/submissions/{submission_id}/plagiarism",
    response_model=SubmissionPlagiarismLatest,
)
async def get_latest(
    submission_id: str,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> SubmissionPlagiarismLatest:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    pair_repo = PairRepository(db)
    pairs = await pair_repo.list_by_submission(
        submission_id=submission_id, tenant_id=principal.tenant_id, limit=200
    )
    if not pairs:
        return SubmissionPlagiarismLatest(submission_id=submission_id)
    max_sim = max(p.similarity for p in pairs)
    latest_pair = max(pairs, key=lambda p: p.created_at)
    run_repo = RunRepository(db)
    run = await run_repo.get_for_tenant(latest_pair.run_id, principal.tenant_id)
    return SubmissionPlagiarismLatest(
        submission_id=submission_id,
        latest_run_id=latest_pair.run_id,
        provider=run.provider if run else None,
        max_similarity=max_sim,
        pairs_count=len(pairs),
        suspicious=any(p.similarity >= 0.7 for p in pairs),
        last_checked_at=run.finished_at if run else None,
    )


@router.get("/submissions/{submission_id}/plagiarism/runs")
async def list_runs_for_submission(
    submission_id: str,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    pair_repo = PairRepository(db)
    pairs = await pair_repo.list_by_submission(
        submission_id=submission_id, tenant_id=principal.tenant_id, limit=500
    )
    run_ids = sorted({p.run_id for p in pairs})
    run_repo = RunRepository(db)
    runs = []
    for rid in run_ids:
        run = await run_repo.get_for_tenant(rid, principal.tenant_id)
        if run is not None:
            runs.append(
                {
                    "id": run.id,
                    "provider": run.provider,
                    "status": run.status,
                    "created_at": run.created_at,
                    "finished_at": run.finished_at,
                    "max_similarity": run.max_similarity,
                }
            )
    return {"data": runs}


@router.get("/submissions/{submission_id}/plagiarism/pairs")
async def list_pairs_for_submission(
    submission_id: str,
    course_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    pair_repo = PairRepository(db)
    pairs = await pair_repo.list_by_submission(
        submission_id=submission_id, tenant_id=principal.tenant_id, limit=limit
    )
    return {
        "data": [
            {
                "id": p.id,
                "run_id": p.run_id,
                "a_submission_id": p.a_submission_id,
                "b_submission_id": p.b_submission_id,
                "similarity": p.similarity,
                "matched_tokens": p.matched_tokens,
                "fragments_count": len(p.fragments or []),
            }
            for p in pairs
        ]
    }


@router.get(
    "/submissions/{submission_id}/plagiarism/percentage",
    response_model=SubmissionPercentage,
)
async def get_percentage(
    submission_id: str,
    course_id: str | None = Query(default=None),
    submission_author_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> SubmissionPercentage:
    """Student-only endpoint returning **only** the % similarity.

    The student must be the owner of the submission. Teachers / admins can also
    call it; in that case it returns the same minimal payload (no fragments).
    """
    assert_self_or_role(
        principal,
        submission_author_id=submission_author_id,
        course_id=course_id,
    )
    pair_repo = PairRepository(db)
    pairs = await pair_repo.list_by_submission(
        submission_id=submission_id, tenant_id=principal.tenant_id, limit=200
    )
    # Tenant isolation guaranteed by repo filter; double-check the most recent
    # pair belongs to the right tenant.
    if pairs:
        assert_tenant(principal, pairs[0].tenant_id)
    if not pairs:
        return SubmissionPercentage(submission_id=submission_id, flagged=False)
    max_sim = max(p.similarity for p in pairs)
    last = max(pairs, key=lambda p: p.created_at)
    return SubmissionPercentage(
        submission_id=submission_id,
        max_similarity_with_others=max_sim,
        checked_at=last.created_at,
        flagged=max_sim >= 0.7,
    )
