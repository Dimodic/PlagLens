"""Admin-side API: retention policy, retention status / run, legal holds, stats."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Path
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.problem import ProblemException
from ...config import settings
from ...db import get_engine
from ...deps import (
    CurrentUser,
    get_session,
    require_admin,
    require_global_role,
    tenant_scope,
)
from ...repositories.events import AuditEventRepository
from ...repositories.retention import LegalHoldRepository, RetentionPolicyRepository
from ...schemas.admin import (
    LegalHoldCreate,
    LegalHoldOut,
    RetentionPolicyOut,
    RetentionPolicyPatch,
    RetentionRunResponse,
    RetentionStatusOut,
    StatsOut,
)
from ...services.partitions import list_existing_partitions
from ...services.retention import cutoff_date, run_retention, select_candidates

router = APIRouter(prefix="/admin/audit", tags=["audit-admin"])


# ---- Retention policy ---------------------------------------------------- #
@router.get("/retention-policy", response_model=RetentionPolicyOut)
async def get_retention_policy(
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    session: AsyncSession = Depends(get_session),
):
    repo = RetentionPolicyRepository(session)
    policy = await repo.get_or_create_for_tenant(
        tenant_id, settings.retention_default_days, settings.retention_long_days
    )
    return RetentionPolicyOut.model_validate(policy)


@router.patch("/retention-policy", response_model=RetentionPolicyOut)
async def patch_retention_policy(
    body: RetentionPolicyPatch,
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    session: AsyncSession = Depends(get_session),
):
    repo = RetentionPolicyRepository(session)
    policy = await repo.get_or_create_for_tenant(
        tenant_id, settings.retention_default_days, settings.retention_long_days
    )
    fields = body.model_dump(exclude_none=True)
    fields["updated_by"] = user.id
    await repo.update(policy, **fields)
    return RetentionPolicyOut.model_validate(policy)


@router.get("/retention-status", response_model=RetentionStatusOut)
async def retention_status(
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
):
    partitions = await list_existing_partitions(session)
    candidates = select_candidates(
        partitions, cutoff=cutoff_date(days=settings.retention_default_days)
    )
    return RetentionStatusOut(
        pending_cleanup_partitions=candidates,
        next_cleanup_at=None,
        last_cleanup_at=None,
        last_cleanup_dropped=0,
    )


@router.post("/retention:run-now", response_model=RetentionRunResponse)
async def retention_run_now(
    user: CurrentUser = Depends(require_admin()),
    session: AsyncSession = Depends(get_session),
):
    hold_repo = LegalHoldRepository(session)
    legal_ids = await hold_repo.list_active_resource_ids(tenant_id=None)
    result = await run_retention(
        get_engine(),
        session,
        legal_hold_resource_ids=legal_ids,
        days=settings.retention_default_days,
        dry_run=False,
    )
    return RetentionRunResponse(
        dry_run=False,
        candidate_partitions=result.candidate_partitions,
        blocked_by_legal_hold=result.blocked_by_legal_hold,
        dropped=result.dropped,
    )


# ---- Legal holds --------------------------------------------------------- #
@router.get("/legal-holds", response_model=list[LegalHoldOut])
async def list_legal_holds(
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    session: AsyncSession = Depends(get_session),
):
    repo = LegalHoldRepository(session)
    rows = await repo.list_active(tenant_id=tenant_id)
    return [LegalHoldOut.model_validate(r) for r in rows]


@router.post("/legal-holds", response_model=LegalHoldOut, status_code=201)
async def create_legal_hold(
    body: LegalHoldCreate,
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    session: AsyncSession = Depends(get_session),
):
    repo = LegalHoldRepository(session)
    hold = await repo.create(
        tenant_id=tenant_id,
        resource_id=body.resource_id,
        resource_type=body.resource_type,
        reason=body.reason,
        requested_by=user.id,
    )
    return LegalHoldOut.model_validate(hold)


@router.delete("/legal-holds/{hold_id}", status_code=204)
async def end_legal_hold(
    hold_id: str = Path(..., min_length=1),
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    session: AsyncSession = Depends(get_session),
):
    repo = LegalHoldRepository(session)
    ok = await repo.end(hold_id, tenant_id=tenant_id)
    if not ok:
        raise ProblemException(status=404, code="NOT_FOUND", title="Legal hold not found")
    return None


# ---- Stats --------------------------------------------------------------- #
@router.get("/stats", response_model=StatsOut)
async def stats(
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditEventRepository(session)
    data = await repo.stats(tenant_id=tenant_id)
    _ = datetime.now(UTC)  # ensure import is used
    return StatsOut(**data)
