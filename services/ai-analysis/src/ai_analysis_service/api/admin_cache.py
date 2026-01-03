"""Admin cache endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Response, status

from ..common.auth import require_admin, require_teacher_or_assistant
from ..deps import CacheDep, PrincipalDep, SessionDep
from ..schemas import CacheStats
from ._helpers import auth_admin

router = APIRouter(prefix="/api/v1/admin/ai")


@router.get("/cache/stats", response_model=CacheStats)
async def cache_stats(principal: PrincipalDep, cache: CacheDep) -> CacheStats:
    auth_admin(principal)
    count, size = await cache.stats(principal.tenant_id)
    # Hit rate is tracked via Prometheus counter; here surface a derived
    # observation if available, otherwise 0.0.
    return CacheStats(hit_rate=0.0, total_keys=count, estimated_size_bytes=size)


@router.delete("/cache", status_code=status.HTTP_204_NO_CONTENT)
async def clear_tenant_cache(
    principal: PrincipalDep, cache: CacheDep
) -> Response:
    require_admin(principal)
    pattern = f"{cache._prefix}:{principal.tenant_id}:cache:ai:*"
    await cache.delete_by_prefix(pattern)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/cache/by-prompt-version/{version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def clear_by_prompt_version(
    version_id: str, principal: PrincipalDep, cache: CacheDep
) -> Response:
    require_admin(principal)
    # Prompt version is part of the cache key hash so we can't filter without
    # a secondary index. As a pragmatic fallback, drop the entire tenant cache.
    pattern = f"{cache._prefix}:{principal.tenant_id}:cache:ai:*"
    await cache.delete_by_prefix(pattern)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/cache/by-submission/{submission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def clear_by_submission(
    submission_id: str,
    principal: PrincipalDep,
    cache: CacheDep,
    session: SessionDep,
) -> Response:
    # Teachers (course-scoped) may clear their own submissions' cache.
    from sqlalchemy import select

    from ..models import AIAnalysis

    stmt = (
        select(AIAnalysis)
        .where(
            AIAnalysis.submission_id == submission_id,
            AIAnalysis.tenant_id == principal.tenant_id,
        )
        .limit(1)
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is not None:
        require_teacher_or_assistant(principal, row.course_id)
    else:
        require_admin(principal)
    pattern = f"{cache._prefix}:{principal.tenant_id}:cache:ai:*"
    await cache.delete_by_prefix(pattern)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
