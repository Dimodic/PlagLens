"""Global / admin dashboards (§G)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
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


@router.get("/activity")
async def activity(
    request: Request,
    tenant_id: str | None = Query(default=None),
    months: int = Query(default=24, ge=3, le=36),
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    """Monthly-submissions series (gap-filled) + top courses by submissions —
    the chart data behind the admin «Обзор». ``tenant_id`` omitted ⇒ whole
    instance; pass it to scope to one organisation."""
    return await _service(request, session).activity(tenant_id, months)


@router.get("/live-metrics")
async def live_metrics(
    request: Request,
    minutes: int = Query(default=15, ge=5, le=60),
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    """Live Prometheus metrics (request rate, p95 latency, per-service
    traffic, status mix, services-up) for the admin overview's
    auto-refreshing «system pulse» charts."""
    return await _service(request, session).live_metrics(minutes)


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
