"""Sync schedules (§G)."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.api.v1.configs import ensure_owner_or_admin
from integration_service.common.auth import Principal
from integration_service.common.ids import new_schedule_id
from integration_service.common.kafka_bus import KafkaBus
from integration_service.common.problems import not_found
from integration_service.deps import bus_dep, principal_dep, session_dep
from integration_service.models import SyncSchedule
from integration_service.repositories import IntegrationConfigRepo, SyncScheduleRepo
from integration_service.schemas import (
    Page,
    Pagination,
    ScheduleCreate,
    ScheduleOut,
    ScheduleUpdate,
)
from integration_service.services.imports import enqueue_import
from integration_service.services.schedules import compute_next_run_at, get_runner

router = APIRouter(prefix="/integrations", tags=["schedules"])


def _to_dto(s: SyncSchedule) -> ScheduleOut:
    return ScheduleOut.model_validate(s)


@router.get("/{config_id}/schedules", response_model=Page[ScheduleOut])
async def list_schedules(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> Page[ScheduleOut]:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    repo = SyncScheduleRepo(session)
    rows = await repo.list_for_config(config_id)
    return Page[ScheduleOut](
        data=[_to_dto(r) for r in rows],
        pagination=Pagination(next_cursor=None, has_more=False, limit=len(rows)),
    )


@router.post("/{config_id}/schedules", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    config_id: str,
    payload: ScheduleCreate,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> ScheduleOut:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    sch = SyncSchedule(
        id=new_schedule_id(),
        integration_id=config_id,
        tenant_id=p.tenant_id,
        cron=payload.cron,
        scope=payload.scope or {},
        enabled=payload.enabled,
        next_run_at=compute_next_run_at(payload.cron),
    )
    repo = SyncScheduleRepo(session)
    await repo.add(sch)
    await session.commit()
    runner = get_runner()
    runner.add(sch)
    return _to_dto(sch)


@router.get("/{config_id}/schedules/{schedule_id}", response_model=ScheduleOut)
async def get_schedule(
    config_id: str,
    schedule_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> ScheduleOut:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    repo = SyncScheduleRepo(session)
    sch = await repo.get(schedule_id, integration_id=config_id)
    if sch is None:
        raise not_found("SyncSchedule", schedule_id)
    return _to_dto(sch)


@router.patch("/{config_id}/schedules/{schedule_id}", response_model=ScheduleOut)
async def patch_schedule(
    config_id: str,
    schedule_id: str,
    payload: ScheduleUpdate,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> ScheduleOut:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    repo = SyncScheduleRepo(session)
    sch = await repo.get(schedule_id, integration_id=config_id)
    if sch is None:
        raise not_found("SyncSchedule", schedule_id)
    if payload.cron is not None:
        sch.cron = payload.cron
        sch.next_run_at = compute_next_run_at(payload.cron)
    if payload.scope is not None:
        sch.scope = payload.scope
    if payload.enabled is not None:
        sch.enabled = payload.enabled
    await session.commit()
    runner = get_runner()
    if sch.enabled:
        runner.add(sch)
    else:
        runner.remove(sch.id)
    return _to_dto(sch)


@router.delete("/{config_id}/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    config_id: str,
    schedule_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> None:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    repo = SyncScheduleRepo(session)
    sch = await repo.get(schedule_id, integration_id=config_id)
    if sch is None:
        raise not_found("SyncSchedule", schedule_id)
    await repo.delete(sch)
    await session.commit()
    get_runner().remove(schedule_id)


@router.post("/{config_id}/schedules/{schedule_id}:run-now")
async def run_now(
    config_id: str,
    schedule_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> dict[str, Any]:
    crepo = IntegrationConfigRepo(session)
    cfg = await crepo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    repo = SyncScheduleRepo(session)
    sch = await repo.get(schedule_id, integration_id=config_id)
    if sch is None:
        raise not_found("SyncSchedule", schedule_id)
    job = await enqueue_import(session, cfg, sch.scope or {}, "scheduled", bus=bus)
    sch.last_run_at = datetime.now(UTC)
    sch.next_run_at = compute_next_run_at(sch.cron)
    await session.commit()
    return {"job_id": job.id, "status": job.status}
