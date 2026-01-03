"""Scheduled exports CRUD + run-now (§D)."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.deps import get_session
from ...common.ids import new_schedule_id
from ...common.problem import forbidden, not_found
from ...common.rbac import Principal, get_principal
from ...common.time import iso, utcnow
from ...models.reporting import ScheduledExport
from ...repositories.schedules import ScheduleRepo
from ...schemas.exports import ScheduledExportCreate, ScheduledExportPatch

router = APIRouter(tags=["scheduled-exports"])


def _ensure_owner(p: Principal, course_id: str) -> None:
    if p.has_global("super_admin", "admin"):
        return
    if p.has_course_role(course_id, "owner", "co_owner"):
        return
    # JWT ``course_roles`` are empty by default — identity-service doesn't
    # populate them — so a teacher who owns the course has nothing to
    # match. Fall back to the global role: any teacher passes (the
    # downstream builder re-checks via the forwarded token).
    if p.has_global("teacher"):
        return
    raise forbidden("Need owner/co_owner")


def _to_dict(s: ScheduledExport) -> dict:
    return {
        "id": s.id,
        "course_id": s.course_id,
        "kind": s.kind,
        "format": s.fmt,
        "target": s.target,
        "cron": s.cron,
        "scope": s.scope,
        "enabled": s.enabled,
        "last_run_at": iso(s.last_run_at) if s.last_run_at else None,
        "next_run_at": iso(s.next_run_at) if s.next_run_at else None,
        "created_by": s.created_by,
        "created_at": iso(s.created_at),
    }


@router.get("/courses/{course_id}/scheduled-exports")
async def list_schedules(
    course_id: str,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _ensure_owner(p, course_id)
    repo = ScheduleRepo(session)
    items = await repo.list_for_course(p.tenant_id, course_id)
    return {
        "data": [_to_dict(s) for s in items],
        "pagination": {"next_cursor": None, "has_more": False, "limit": len(items)},
    }


@router.post("/courses/{course_id}/scheduled-exports", status_code=201)
async def create_schedule(
    course_id: str,
    payload: ScheduledExportCreate,
    request: Request,
    response: Response,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    _ensure_owner(p, course_id)
    sched_id = new_schedule_id()
    now = utcnow()
    sched = ScheduledExport(
        id=sched_id,
        tenant_id=p.tenant_id,
        course_id=course_id,
        kind=payload.kind,
        fmt=payload.format,
        target=payload.target,
        cron=payload.cron,
        scope=payload.scope or {"course_id": course_id},
        enabled=payload.enabled,
        created_by=p.user_id,
        created_at=now,
        next_run_at=request.app.state.scheduler._next_run_at(payload.cron, now),
    )
    repo = ScheduleRepo(session)
    await repo.add(sched)
    await session.commit()
    response.headers["Location"] = f"/api/v1/courses/{course_id}/scheduled-exports/{sched_id}"
    return _to_dict(sched)


@router.get("/courses/{course_id}/scheduled-exports/{schedule_id}")
async def get_schedule(
    course_id: str,
    schedule_id: str,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _ensure_owner(p, course_id)
    repo = ScheduleRepo(session)
    sched = await repo.get(p.tenant_id, schedule_id)
    if sched is None or sched.course_id != course_id:
        raise not_found(f"Schedule {schedule_id} not found")
    return _to_dict(sched)


@router.patch("/courses/{course_id}/scheduled-exports/{schedule_id}")
async def patch_schedule(
    course_id: str,
    schedule_id: str,
    payload: ScheduledExportPatch,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _ensure_owner(p, course_id)
    repo = ScheduleRepo(session)
    sched = await repo.get(p.tenant_id, schedule_id)
    if sched is None or sched.course_id != course_id:
        raise not_found(f"Schedule {schedule_id} not found")
    fields = payload.model_dump(exclude_unset=True)
    if "cron" in fields and fields["cron"]:
        sched.next_run_at = request.app.state.scheduler._next_run_at(fields["cron"], utcnow())
    await repo.update(sched, **fields)
    await session.commit()
    return _to_dict(sched)


@router.delete("/courses/{course_id}/scheduled-exports/{schedule_id}", status_code=204)
async def delete_schedule(
    course_id: str,
    schedule_id: str,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _ensure_owner(p, course_id)
    repo = ScheduleRepo(session)
    sched = await repo.get(p.tenant_id, schedule_id)
    if sched is None or sched.course_id != course_id:
        raise not_found(f"Schedule {schedule_id} not found")
    await repo.soft_delete(sched)
    await session.commit()
    return Response(status_code=204)


@router.post("/courses/{course_id}/scheduled-exports/{schedule_id}:run-now", status_code=202)
async def run_now(
    course_id: str,
    schedule_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _ensure_owner(p, course_id)
    repo = ScheduleRepo(session)
    sched = await repo.get(p.tenant_id, schedule_id)
    if sched is None or sched.course_id != course_id:
        raise not_found(f"Schedule {schedule_id} not found")
    svc = request.app.state.export_service
    job = await svc.create(
        session,
        tenant_id=p.tenant_id,
        triggered_by=p.user_id,
        kind=sched.kind,
        fmt=sched.fmt,
        scope=sched.scope or {"course_id": course_id},
        options={},
    )
    sched.last_run_at = utcnow()
    await session.commit()
    # Manual "run now" — we have a live request, so the user's bearer
    # token rides through and the grades builder fetches as them. Cron
    # runs (main.py:_run_scheduled_export) mint a token instead.
    bearer = request.headers.get("authorization")
    asyncio.create_task(svc.run_now(job.id, bearer_token=bearer))
    return {
        "operation_id": job.operation_id,
        "export_id": job.id,
        "status_url": f"/api/v1/operations/{job.operation_id}",
    }
