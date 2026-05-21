"""Tenant dashboards (§F)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.cache import JsonCache
from ...common.deps import get_session
from ...common.problem import forbidden, tenant_mismatch
from ...common.rbac import Principal, require_global
from ...dashboards.service import DashboardService

router = APIRouter(prefix="/tenants/{tenant_id}/dashboard", tags=["dashboards-tenant"])


def _ensure_admin(p: Principal, tenant_id: str) -> None:
    if p.has_global("admin"):
        return
    if not p.has_global("admin"):
        raise forbidden("Need admin")
    if p.tenant_id != tenant_id:
        raise tenant_mismatch()


def _service(request: Request, session: AsyncSession) -> DashboardService:
    cache = JsonCache(request.app.state.redis, prefix=f"{request.app.state.settings.redis_prefix}:dash")
    return DashboardService(
        session,
        cache,
        overview_ttl=request.app.state.settings.cache_overview_ttl_seconds,
        detail_ttl=request.app.state.settings.cache_detail_ttl_seconds,
    )


@router.get("")
async def overview(
    tenant_id: str,
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(p, tenant_id)
    return await _service(request, session).tenant_overview(tenant_id)


@router.get("/active-courses")
async def active_courses(
    tenant_id: str,
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(p, tenant_id)
    return await _service(request, session).tenant_active_courses(tenant_id)


@router.get("/active-users")
async def active_users(
    tenant_id: str,
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(p, tenant_id)
    return await _service(request, session).tenant_active_users(tenant_id)


@router.get("/integrations-health")
async def integrations_health(
    tenant_id: str,
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(p, tenant_id)
    return await _service(request, session).tenant_integrations_health(tenant_id)


@router.get("/ai-usage")
async def ai_usage(
    tenant_id: str,
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(p, tenant_id)
    return await _service(request, session).tenant_ai_usage(tenant_id)


@router.get("/storage-usage")
async def storage_usage(
    tenant_id: str,
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(p, tenant_id)
    return await _service(request, session).tenant_storage_usage(tenant_id)
