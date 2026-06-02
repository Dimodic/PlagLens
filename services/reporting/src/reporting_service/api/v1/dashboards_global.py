"""Global / admin dashboards (§G)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.cache import JsonCache
from ...common.deps import get_session
from ...common.rbac import Principal, require_global
from ...dashboards.service import DashboardService

router = APIRouter(prefix="/admin/dashboard", tags=["dashboards-global"])


def _service(request: Request, session: AsyncSession) -> DashboardService:
    cache = JsonCache(request.app.state.redis, prefix=f"{request.app.state.settings.redis_prefix}:dash")
    return DashboardService(
        session,
        cache,
        overview_ttl=request.app.state.settings.cache_overview_ttl_seconds,
        detail_ttl=request.app.state.settings.cache_detail_ttl_seconds,
    )


@router.get("/global")
async def global_overview(
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    return await _service(request, session).global_overview()


@router.get("/overview")
async def instance_overview(
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    """Whole-instance KPI roll-up — same shape as a tenant overview but
    aggregated across every tenant. Backs the admin dashboard's default
    «all organisations» view."""
    return await _service(request, session).instance_overview()


@router.get("/system-health")
async def system_health(
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    return await _service(request, session).system_health()


@router.get("/operations")
async def operations_overview(
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    return await _service(request, session).operations_overview()


@router.get("/errors")
async def errors_overview(
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    return await _service(request, session).errors_overview()
