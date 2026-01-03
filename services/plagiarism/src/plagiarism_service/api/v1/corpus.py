"""§D — cross-course corpus admin/search."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.problem import forbidden, not_found
from ...common.rbac import Principal, assert_course_role, assert_tenant
from ...repositories.corpus_repo import CorpusRepository
from ...schemas.corpus import (
    CorpusEntryItem,
    CorpusRebuildResponse,
    CorpusSearchHit,
    CorpusSearchRequest,
    CorpusSearchResponse,
    CorpusStats,
)
from ...services.corpus_service import CorpusService
from ..deps import get_db, get_principal_dep

router = APIRouter(prefix="/plagiarism-corpus", tags=["corpus"])


@router.get("", response_model=CorpusStats)
async def get_corpus_stats(
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> CorpusStats:
    if not principal.is_admin():
        raise forbidden("Only tenant admins can view tenant-wide corpus stats")
    cs = CorpusService(db)
    stats = await cs.stats(principal.tenant_id)
    return CorpusStats(**stats)


@router.get("/courses/{course_id}")
async def get_course_corpus(
    course_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner"))
    repo = CorpusRepository(db)
    entries = await repo.list_for_tenant(
        tenant_id=principal.tenant_id, course_id=course_id, limit=200
    )
    return {
        "data": [
            CorpusEntryItem(
                id=e.id,
                submission_id=e.submission_id,
                course_id=e.course_id,
                assignment_id=e.assignment_id,
                language=e.language,
                token_count=e.token_count,
                added_at=e.added_at,
            ).model_dump()
            for e in entries
        ]
    }


@router.post(":rebuild", response_model=CorpusRebuildResponse, status_code=202)
async def rebuild_corpus(
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> CorpusRebuildResponse:
    if not principal.is_admin():
        raise forbidden("Admin role required for corpus rebuild")
    repo = CorpusRepository(db)
    entries = await repo.list_for_tenant(tenant_id=principal.tenant_id, limit=10000)
    return CorpusRebuildResponse(
        operation_id=f"op_corpus_{principal.tenant_id}",
        enqueued_count=len(entries),
    )


@router.post("/search", response_model=CorpusSearchResponse)
async def search_corpus(
    body: CorpusSearchRequest,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> CorpusSearchResponse:
    repo = CorpusRepository(db)
    target = await repo._get_by_submission(body.submission_id)
    if target is None:
        raise not_found(f"Submission {body.submission_id} not in corpus")
    assert_tenant(principal, target.tenant_id)
    cs = CorpusService(db)
    # Use the stored fingerprint as the query.
    hits = await cs.search_similar(
        tenant_id=principal.tenant_id,
        query_fingerprint=target.fingerprints,
        language=body.language or target.language,
        top_k=body.top_k,
        min_similarity=body.min_similarity,
        exclude_submission_ids=[body.submission_id],
    )
    return CorpusSearchResponse(
        query_submission_id=body.submission_id,
        hits=[
            CorpusSearchHit(
                entry_id=e.id,
                submission_id=e.submission_id,
                course_id=e.course_id,
                assignment_id=e.assignment_id,
                similarity=sim,
            )
            for e, sim in hits
        ],
    )


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_corpus_entry(
    entry_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not principal.is_admin():
        raise forbidden("Admin role required to delete corpus entries")
    repo = CorpusRepository(db)
    entry = await repo.get(entry_id)
    if entry is None:
        raise not_found(f"Corpus entry {entry_id} not found")
    assert_tenant(principal, entry.tenant_id)
    await repo.soft_delete(entry_id)
    await db.commit()
