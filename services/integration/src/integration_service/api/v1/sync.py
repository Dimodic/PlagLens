"""Sync runs + import jobs (§F)."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.api.v1.configs import ensure_owner_or_admin
from integration_service.common.auth import Principal
from integration_service.common.kafka_bus import KafkaBus
from integration_service.common.problems import ProblemException, not_found
from integration_service.config import get_settings
from integration_service.deps import bus_dep, principal_dep, session_dep
from integration_service.repositories import ImportJobRepo, IntegrationConfigRepo
from integration_service.schemas import (
    ImportJobOut,
    OperationOut,
    Page,
    Pagination,
    SyncRequest,
)
from integration_service.services import idempotency
from integration_service.services.imports import enqueue_import

router = APIRouter(prefix="/integrations", tags=["sync"])


def _job_dto(j) -> ImportJobOut:  # type: ignore[no-untyped-def]
    return ImportJobOut.model_validate(j)


@router.post("/{config_id}/sync", status_code=status.HTTP_202_ACCEPTED)
async def trigger_sync(
    config_id: str,
    payload: SyncRequest,
    response: Response,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> OperationOut:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)

    body = payload.model_dump(mode="json")
    cached, conflict = await idempotency.get_cached_response(p.tenant_id, idempotency_key or "", body)
    if conflict:
        raise ProblemException(409, "IDEMPOTENCY_KEY_CONFLICT", "Conflict", "key reused with different body")
    if cached:
        return OperationOut(**cached)

    scope: dict[str, Any] = payload.scope.model_dump()
    if payload.force_full:
        scope["force_full"] = True
    job = await enqueue_import(session, cfg, scope, "manual", bus=bus)
    await session.commit()
    response.headers["Location"] = f"{get_settings().api_prefix}/operations/{job.id}"
    op = OperationOut(
        id=job.id,
        kind="submission_import",
        status="queued",
        progress={"completed": 0, "total": 0, "percent": 0.0},
        started_at=None,
        finished_at=None,
        metadata={"integration_id": cfg.id, "kind": cfg.kind},
    )
    if idempotency_key:
        await idempotency.store_response(
            p.tenant_id, idempotency_key, body, op.model_dump(mode="json")
        )
    return op


@router.get("/{config_id}/import-jobs", response_model=Page[ImportJobOut])
async def list_jobs(
    config_id: str,
    limit: int = 50,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> Page[ImportJobOut]:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    jrepo = ImportJobRepo(session)
    rows = await jrepo.list_for_config(config_id, p.tenant_id, limit=limit)
    return Page[ImportJobOut](
        data=[_job_dto(r) for r in rows],
        pagination=Pagination(next_cursor=None, has_more=False, limit=limit),
    )


@router.get("/{config_id}/import-jobs/{job_id}", response_model=ImportJobOut)
async def get_job(
    config_id: str,
    job_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> ImportJobOut:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    jrepo = ImportJobRepo(session)
    job = await jrepo.get(job_id, tenant_id=p.tenant_id)
    if job is None or job.integration_id != config_id:
        raise not_found("ImportJob", job_id)
    return _job_dto(job)


@router.post("/{config_id}/import-jobs/{job_id}:cancel", response_model=ImportJobOut)
async def cancel_job(
    config_id: str,
    job_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> ImportJobOut:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    jrepo = ImportJobRepo(session)
    job = await jrepo.get(job_id, tenant_id=p.tenant_id)
    if job is None or job.integration_id != config_id:
        raise not_found("ImportJob", job_id)
    if job.status not in ("queued", "running"):
        raise ProblemException(409, "CONFLICT", "Conflict", f"job is {job.status}")
    job.status = "cancelled"
    job.finished_at = datetime.now(UTC)
    await session.commit()
    return _job_dto(job)


@router.post("/{config_id}/import-jobs/{job_id}:retry", response_model=ImportJobOut)
async def retry_job(
    config_id: str,
    job_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> ImportJobOut:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    jrepo = ImportJobRepo(session)
    job = await jrepo.get(job_id, tenant_id=p.tenant_id)
    if job is None or job.integration_id != config_id:
        raise not_found("ImportJob", job_id)
    if job.status not in ("failed", "cancelled"):
        raise ProblemException(409, "CONFLICT", "Conflict", "only failed/cancelled jobs can be retried")
    job.status = "queued"
    job.error = None
    job.started_at = None
    job.finished_at = None
    await session.commit()
    return _job_dto(job)
