"""Sync runs + import jobs (§F)."""
from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any, AsyncIterator, Optional

from fastapi import APIRouter, Depends, Header, Response, status
from fastapi.responses import StreamingResponse
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

    # Yandex.Contest has a real "sync all previously imported contests"
    # flow — go through it directly rather than dropping a row into the
    # queued/Kafka pipe that nothing actually consumes. (The legacy
    # ``enqueue_import`` path emits ``integration.import.started.v1``
    # but no worker subscribes; for YC clicking "Синхронизировать" on
    # the integration page would otherwise leave a row stuck "в
    # очереди" forever.)
    if cfg.kind == "yandex_contest":
        from integration_service.services.yc_import import (
            run_sync_all_imported_contests,
            start_import_job,
        )

        job_id = await start_import_job(
            config_id=str(cfg.id),
            tenant_id=str(cfg.tenant_id),
            scope=scope,
            trigger="manual",
        )
        cfg_snapshot = type(
            "_CfgSnap",
            (),
            {
                "id": cfg.id,
                "tenant_id": cfg.tenant_id,
                "course_id": cfg.course_id,
                "settings": cfg.settings,
            },
        )()
        # Scope the sync to the homeworks the teacher picked (ДЗ). Empty
        # → re-sync every imported homework.
        hw_filter: set[str] | None = (
            {str(h) for h in payload.scope.homework_ids}
            if payload.scope.homework_ids
            else None
        )
        asyncio.create_task(
            run_sync_all_imported_contests(
                job_id=job_id, cfg=cfg_snapshot, homework_filter=hw_filter
            )
        )
        response.headers["Location"] = (
            f"{get_settings().api_prefix}/operations/{job_id}"
        )
        op = OperationOut(
            id=job_id,
            kind="submission_import",
            status="running",
            progress={"completed": 0, "total": 0, "percent": 0.0},
            started_at=datetime.now(UTC),
            finished_at=None,
            metadata={"integration_id": cfg.id, "kind": cfg.kind},
        )
        if idempotency_key:
            await idempotency.store_response(
                p.tenant_id, idempotency_key, body, op.model_dump(mode="json")
            )
        return op

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


@router.get(
    "/{config_id}/import-jobs/{job_id}/events",
    response_class=StreamingResponse,
)
async def stream_import_job_events(
    config_id: str,
    job_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> StreamingResponse:
    """SSE stream of an import job's progress.

    Frontend opens an ``EventSource`` on this endpoint while a job is
    running so the «История синхронизаций» row can show live numbers
    (`ДЗ 2/3 «Имя» · посылок 384`) instead of a flat «в работе» label.
    The stream polls the row every ~1.5s; once the job leaves ``running``
    we emit one final ``done`` event and close. The route is registered
    in the gateway's ``_QUERY_TOKEN_PATTERNS`` because ``EventSource``
    can't set Authorization headers — clients pass ``?access_token=…``.
    """
    # Authorise once up-front; the streaming generator below opens its
    # own DB sessions per poll because the request-scoped session would
    # otherwise be torn down at function return.
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    jrepo = ImportJobRepo(session)
    job = await jrepo.get(job_id, tenant_id=p.tenant_id)
    if job is None or job.integration_id != config_id:
        raise not_found("ImportJob", job_id)

    tenant_id = p.tenant_id
    POLL_S = 1.5
    MAX_S = 30 * 60  # safety cap — 30 min, the worker should be long done

    async def gen() -> AsyncIterator[bytes]:
        from integration_service.common.db import get_sessionmaker

        sm = get_sessionmaker()
        elapsed = 0.0
        last_payload: str | None = None
        while elapsed < MAX_S:
            async with sm() as s:
                repo = ImportJobRepo(s)
                row = await repo.get(job_id, tenant_id=tenant_id)
            if row is None:
                yield b"event: error\ndata: {\"detail\":\"job gone\"}\n\n"
                return
            payload = json.dumps(
                {
                    "id": row.id,
                    "status": row.status,
                    "progress": row.progress or {},
                    "stats": row.stats or {},
                    "started_at": row.started_at.isoformat()
                    if row.started_at
                    else None,
                    "finished_at": row.finished_at.isoformat()
                    if row.finished_at
                    else None,
                    "error": row.error,
                }
            )
            # Only emit when something actually changed — saves bytes
            # on a long quiet job.
            if payload != last_payload:
                last_payload = payload
                yield f"event: progress\ndata: {payload}\n\n".encode()
            if row.status not in ("running", "queued"):
                yield b"event: done\ndata: {}\n\n"
                return
            # Heartbeat between progress events so proxies don't drop
            # the connection on a long compute-only stretch.
            yield b": ping\n\n"
            await asyncio.sleep(POLL_S)
            elapsed += POLL_S
        yield b"event: error\ndata: {\"detail\":\"stream timeout\"}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
