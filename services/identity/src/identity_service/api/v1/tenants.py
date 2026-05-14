"""Section F — Tenants."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.events import make_event
from ...common.ids import tenant_id as new_tenant_id
from ...common.pagination import Page, Pagination
from ...common.problem import ProblemException
from ...common.slug import slugify, unique_slug
from ...config import settings
from ...deps import (
    CurrentUser,
    assert_same_tenant,
    current_user,
    get_session,
    require_global_role,
)
from ...models import Tenant
from ...repositories.tenants import TenantRepository
from ...schemas.tenants import (
    TenantCreate,
    TenantOut,
    TenantSettingsOut,
    TenantSettingsUpdate,
    TenantUpdate,
    TenantUsageOut,
)

router = APIRouter(prefix="/tenants", tags=["tenants"])

logger = logging.getLogger(__name__)


async def _emit_tenant_event(request: Request, event_type: str, t: Tenant) -> None:
    """Publish a tenant-lifecycle CloudEvent (best-effort).

    Downstream consumers act on these: e.g. the Course service archives all
    courses on ``identity.tenant.deleted.v1`` and Integration tears down its
    per-tenant config. Mirrors ``AuthService._emit_user_event``.
    """
    producer = getattr(request.app.state, "producer", None)
    if producer is None:
        return
    event = make_event(
        event_type,
        data={"tenant_id": t.id, "slug": t.slug, "name": t.name, "status": t.status},
        tenant_id=t.id,
        subject=f"tenants/{t.id}",
    )
    try:
        await producer.publish(settings.kafka_topic_tenant, event)
    except Exception as exc:  # pragma: no cover - producer is best-effort
        logger.warning("Failed to publish %s: %s", event_type, exc)


def _tenant_to_out(t: Tenant) -> TenantOut:
    return TenantOut(
        id=t.id,
        slug=t.slug,
        name=t.name,
        domain=t.domain,
        status=t.status,
        created_at=t.created_at,
        deleted_at=t.deleted_at,
    )


@router.get("", response_model=Page[TenantOut], summary="List tenants (super_admin)")
async def list_tenants(
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,  # noqa: ARG001 — TODO: cursor decode
    user: CurrentUser = Depends(require_global_role("super_admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),
) -> Page[TenantOut]:
    tenants = TenantRepository(session)
    rows = await tenants.list(limit=limit, offset=0)
    return Page[TenantOut](
        data=[_tenant_to_out(t) for t in rows],
        pagination=Pagination(limit=limit, has_more=False, next_cursor=None),
    )


@router.post(
    "",
    response_model=TenantOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new tenant (super_admin)",
)
async def create_tenant(
    payload: TenantCreate,
    request: Request,
    user: CurrentUser = Depends(require_global_role("super_admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),
) -> TenantOut:
    repo = TenantRepository(session)
    # Slug auto-derived from the name — never user-typed. Any
    # client-provided ``payload.slug`` is ignored.
    base = await slugify(payload.name, fallback="tenant")

    async def _taken(s: str) -> bool:
        return await repo.get_by_slug(s) is not None

    slug = await unique_slug(base, exists=_taken)
    t = Tenant(
        id=new_tenant_id(),
        slug=slug,
        name=payload.name,
        domain=payload.domain,
        cors_origins=payload.cors_origins,
        settings=payload.settings,
    )
    await repo.add(t)
    await _emit_tenant_event(request, "identity.tenant.created.v1", t)
    return _tenant_to_out(t)


@router.get("/{tenant_id}", response_model=TenantOut, summary="Get tenant by id")
async def get_tenant(
    tenant_id: str,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TenantOut:
    repo = TenantRepository(session)
    t = await repo.get(tenant_id)
    if t is None or t.deleted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")
    if user.global_role != "super_admin":
        await assert_same_tenant(user, t.id)
    return _tenant_to_out(t)


@router.patch(
    "/{tenant_id}",
    response_model=TenantOut,
    summary="Update tenant (name, domain)",
)
async def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    user: CurrentUser = Depends(require_global_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
) -> TenantOut:
    repo = TenantRepository(session)
    t = await repo.get(tenant_id)
    if t is None or t.deleted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")
    if user.global_role != "super_admin":
        await assert_same_tenant(user, t.id)
    if payload.name is not None:
        t.name = payload.name
    if payload.domain is not None:
        t.domain = payload.domain
    return _tenant_to_out(t)


@router.delete(
    "/{tenant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete tenant",
)
async def delete_tenant(
    tenant_id: str,
    request: Request,
    user: CurrentUser = Depends(require_global_role("super_admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),
) -> Response:
    repo = TenantRepository(session)
    t = await repo.get(tenant_id)
    if t is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")
    t.deleted_at = datetime.now(timezone.utc)
    await _emit_tenant_event(request, "identity.tenant.deleted.v1", t)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{tenant_id}:suspend",
    response_model=TenantOut,
    summary="Suspend a tenant",
)
async def suspend_tenant(
    tenant_id: str,
    request: Request,
    user: CurrentUser = Depends(require_global_role("super_admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),
) -> TenantOut:
    repo = TenantRepository(session)
    t = await repo.get(tenant_id)
    if t is None or t.deleted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")
    t.status = "suspended"
    await _emit_tenant_event(request, "identity.tenant.suspended.v1", t)
    return _tenant_to_out(t)


@router.post(
    "/{tenant_id}:activate",
    response_model=TenantOut,
    summary="Re-activate a suspended tenant",
)
async def activate_tenant(
    tenant_id: str,
    request: Request,
    user: CurrentUser = Depends(require_global_role("super_admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),
) -> TenantOut:
    repo = TenantRepository(session)
    t = await repo.get(tenant_id)
    if t is None or t.deleted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")
    t.status = "active"
    await _emit_tenant_event(request, "identity.tenant.activated.v1", t)
    return _tenant_to_out(t)


@router.get(
    "/{tenant_id}/settings",
    response_model=TenantSettingsOut,
    summary="Read tenant settings",
)
async def get_tenant_settings(
    tenant_id: str,
    user: CurrentUser = Depends(require_global_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
) -> TenantSettingsOut:
    repo = TenantRepository(session)
    t = await repo.get(tenant_id)
    if t is None or t.deleted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")
    if user.global_role != "super_admin":
        await assert_same_tenant(user, t.id)
    return TenantSettingsOut(cors_origins=list(t.cors_origins or []), settings=dict(t.settings or {}))


@router.patch(
    "/{tenant_id}/settings",
    response_model=TenantSettingsOut,
    summary="Update tenant settings (CORS origins, default OAuth, etc.)",
)
async def update_tenant_settings(
    tenant_id: str,
    payload: TenantSettingsUpdate,
    user: CurrentUser = Depends(require_global_role("admin", "super_admin")),
    session: AsyncSession = Depends(get_session),
) -> TenantSettingsOut:
    repo = TenantRepository(session)
    t = await repo.get(tenant_id)
    if t is None or t.deleted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")
    if user.global_role != "super_admin":
        await assert_same_tenant(user, t.id)
    if payload.cors_origins is not None:
        t.cors_origins = payload.cors_origins
    if payload.settings is not None:
        merged = dict(t.settings or {})
        merged.update(payload.settings)
        t.settings = merged
    return TenantSettingsOut(cors_origins=list(t.cors_origins or []), settings=dict(t.settings or {}))


@router.get(
    "/{tenant_id}/usage",
    response_model=TenantUsageOut,
    summary="Tenant usage metrics (stubbed)",
)
async def get_tenant_usage(
    tenant_id: str,
    user: CurrentUser = Depends(require_global_role("admin", "super_admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),  # noqa: ARG001
) -> TenantUsageOut:
    # TODO: aggregate from Reporting Service / SQL counts.
    return TenantUsageOut(tenant_id=tenant_id)


# Tenant-level audit is served by the Audit Service's tenant-scoped
# ``GET /api/v1/audit/events`` (a tenant admin only ever sees their own
# tenant's events), so identity no longer carries a stub proxy here.
