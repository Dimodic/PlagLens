"""Read API for audit events."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Body, Depends, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.pagination import Page, Pagination
from ...common.problem import ProblemException
from ...deps import (
    CurrentUser,
    current_user,
    get_session,
    require_global_role,
    tenant_scope,
)
from ...repositories.events import AuditEventRepository
from ...schemas.events import (
    AuditEventOut,
    EventExportRequest,
    EventExportResponse,
    EventSearchAggResult,
    EventSearchRequest,
)
from ...services.export import request_export

router = APIRouter(prefix="/audit", tags=["audit-events"])


def _to_out(event) -> AuditEventOut:
    """Transform ORM AuditEvent into Pydantic output schema."""
    return AuditEventOut(
        id=event.id,
        event_id=event.event_id,
        tenant_id=event.tenant_id,
        occurred_at=event.occurred_at,
        recorded_at=event.recorded_at,
        actor=event.actor or {},
        action=event.action,
        result=event.result,
        resource=event.resource or {},
        source_service=event.source_service,
        request_id=event.request_id,
        ip=event.ip,
        user_agent=event.user_agent,
        before=event.before,
        after=event.after,
        metadata_=event.metadata_ or {},
        retention_class=event.retention_class,
    )


# ---- A. List + filters ---------------------------------------------------- #
@router.get(
    "/events",
    response_model=Page[AuditEventOut],
    summary="List audit events (filterable)",
)
async def list_events(  # noqa: PLR0913
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    cursor: str | None = Query(default=None),
    limit: int = Query(50, ge=1, le=200),
    action: str | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    actor_type: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    result: str | None = Query(default=None),
    source_service: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditEventRepository(session)
    rows, next_cursor = await repo.list_events(
        tenant_id=tenant_id,
        cursor=cursor,
        limit=limit,
        action=action,
        actor_id=actor_id,
        actor_type=actor_type,
        resource_type=resource_type,
        resource_id=resource_id,
        result=result,
        source_service=source_service,
        since=since,
        until=until,
    )
    return Page[AuditEventOut](
        data=[_to_out(r) for r in rows],
        pagination=Pagination(
            next_cursor=next_cursor, has_more=next_cursor is not None, limit=limit
        ),
    )


@router.get("/events/by-actor/{user_id}", response_model=Page[AuditEventOut])
async def events_by_actor(
    user_id: str = Path(..., min_length=1),
    user: CurrentUser = Depends(current_user),
    tenant_id: str | None = Depends(tenant_scope),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    if user.global_role not in ("admin",) and user.id != user_id:
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Self or admin required"
        )
    repo = AuditEventRepository(session)
    rows, next_cursor = await repo.list_events(
        tenant_id=tenant_id, cursor=cursor, limit=limit, actor_id=user_id
    )
    return Page[AuditEventOut](
        data=[_to_out(r) for r in rows],
        pagination=Pagination(
            next_cursor=next_cursor, has_more=next_cursor is not None, limit=limit
        ),
    )


@router.get(
    "/events/by-resource/{resource_type}/{resource_id}",
    response_model=Page[AuditEventOut],
)
async def events_by_resource(
    resource_type: str,
    resource_id: str,
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),
    tenant_id: str | None = Depends(tenant_scope),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditEventRepository(session)
    rows, next_cursor = await repo.list_events(
        tenant_id=tenant_id,
        cursor=cursor,
        limit=limit,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    return Page[AuditEventOut](
        data=[_to_out(r) for r in rows],
        pagination=Pagination(
            next_cursor=next_cursor, has_more=next_cursor is not None, limit=limit
        ),
    )


@router.get("/timeline", response_model=Page[AuditEventOut])
async def timeline(
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    scope: str = Query("tenant", pattern="^(tenant|course)$"),
    course_id: str | None = None,
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditEventRepository(session)
    extra: dict = {}
    if scope == "course" and course_id:
        extra = {"resource_type": "courses", "resource_id": course_id}
    rows, next_cursor = await repo.list_events(
        tenant_id=tenant_id, cursor=cursor, limit=limit, **extra
    )
    return Page[AuditEventOut](
        data=[_to_out(r) for r in rows],
        pagination=Pagination(
            next_cursor=next_cursor, has_more=next_cursor is not None, limit=limit
        ),
    )


@router.get("/access-denied", response_model=Page[AuditEventOut])
async def access_denied(
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditEventRepository(session)
    rows, next_cursor = await repo.list_events(
        tenant_id=tenant_id,
        cursor=cursor,
        limit=limit,
        action="rbac.access_denied",
    )
    return Page[AuditEventOut](
        data=[_to_out(r) for r in rows],
        pagination=Pagination(
            next_cursor=next_cursor, has_more=next_cursor is not None, limit=limit
        ),
    )


# ---- B. Search (POST) ----------------------------------------------------- #
@router.post(
    "/events:search",
    response_model=dict,
    summary="Full-text + structured search",
)
async def search_events(
    body: EventSearchRequest = Body(...),
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditEventRepository(session)
    filt = body.filters.model_dump(exclude_none=True)
    rows, next_cursor = await repo.list_events(
        tenant_id=tenant_id,
        cursor=body.cursor,
        limit=body.limit,
        q=body.q,
        **filt,
    )
    aggs: list[EventSearchAggResult] = []
    for agg in body.aggregations:
        buckets = await repo.aggregate(
            tenant_id=tenant_id, by=agg.by, filters=filt
        )
        aggs.append(EventSearchAggResult(by=agg.by, buckets=buckets))

    return {
        "data": [_to_out(r).model_dump() for r in rows],
        "pagination": Pagination(
            next_cursor=next_cursor,
            has_more=next_cursor is not None,
            limit=body.limit,
        ).model_dump(),
        "aggregations": [a.model_dump() for a in aggs],
    }


# ---- C. Export ------------------------------------------------------------ #
@router.post(
    "/events:export",
    response_model=EventExportResponse,
    status_code=202,
    summary="Async export proxy to Reporting Service",
)
async def export_events(
    body: EventExportRequest,
    user: CurrentUser = Depends(require_global_role("admin")),
    tenant_id: str | None = Depends(tenant_scope),
):
    handle = await request_export(
        tenant_id=tenant_id, actor_id=user.id, payload=body.model_dump()
    )
    return EventExportResponse(**handle)


# ---- A. detail (kept LAST so /events/by-* paths win) --------------------- #
@router.get("/events/{event_id}", response_model=AuditEventOut)
async def get_event(
    event_id: str,
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),
    tenant_id: str | None = Depends(tenant_scope),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditEventRepository(session)
    ev = await repo.get_by_id(event_id)
    if ev is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Audit event not found")
    if (
        tenant_id is not None
        and ev.tenant_id is not None
        and ev.tenant_id != tenant_id
    ):
        raise ProblemException(
            status=403, code="TENANT_MISMATCH", title="Cross-tenant access denied"
        )
    return _to_out(ev)


# ---- D. Course / user audit shortcuts ------------------------------------ #
shortcut_router = APIRouter(tags=["audit-events"])


@shortcut_router.get(
    "/courses/{course_id}/audit", response_model=Page[AuditEventOut]
)
async def course_audit(
    course_id: str,
    user: CurrentUser = Depends(current_user),
    tenant_id: str | None = Depends(tenant_scope),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    if user.global_role not in ("admin",):
        course_role = user.course_roles.get(course_id)
        if course_role not in ("owner", "co_owner"):
            raise ProblemException(
                status=403, code="FORBIDDEN", title="Course owner / co_owner required"
            )
    repo = AuditEventRepository(session)
    rows, next_cursor = await repo.list_events(
        tenant_id=tenant_id,
        cursor=cursor,
        limit=limit,
        resource_type="courses",
        resource_id=course_id,
    )
    return Page[AuditEventOut](
        data=[_to_out(r) for r in rows],
        pagination=Pagination(
            next_cursor=next_cursor, has_more=next_cursor is not None, limit=limit
        ),
    )


@shortcut_router.get("/users/{user_id}/audit", response_model=Page[AuditEventOut])
async def user_audit(
    user_id: str,
    user: CurrentUser = Depends(current_user),
    tenant_id: str | None = Depends(tenant_scope),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    if user.global_role not in ("admin",) and user.id != user_id:
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Self or admin required"
        )
    repo = AuditEventRepository(session)
    rows, next_cursor = await repo.list_events(
        tenant_id=tenant_id, cursor=cursor, limit=limit, actor_id=user_id
    )
    return Page[AuditEventOut](
        data=[_to_out(r) for r in rows],
        pagination=Pagination(
            next_cursor=next_cursor, has_more=next_cursor is not None, limit=limit
        ),
    )
