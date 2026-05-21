"""Student self-service dashboards (§H)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.cache import JsonCache
from ...common.deps import get_session
from ...common.problem import forbidden
from ...common.rbac import Principal, get_principal
from ...dashboards.service import DashboardService

router = APIRouter(tags=["dashboards-self"])


def _service(request: Request, session: AsyncSession) -> DashboardService:
    cache = JsonCache(request.app.state.redis, prefix=f"{request.app.state.settings.redis_prefix}:dash")
    return DashboardService(
        session,
        cache,
        overview_ttl=request.app.state.settings.cache_overview_ttl_seconds,
        detail_ttl=request.app.state.settings.cache_detail_ttl_seconds,
    )


@router.get("/users/me/dashboard")
async def my_dashboard(
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    return await _service(request, session).student_overview(p.tenant_id, p.user_id)


@router.get("/users/me/courses/{course_id}/grades-summary")
async def my_course_grades(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    if not (p.has_global("admin",) or p.course_role(course_id) is not None):
        raise forbidden("Not a course member")
    return await _service(request, session).student_grades_summary(p.tenant_id, p.user_id, course_id)


@router.get("/users/me/progress")
async def my_progress(
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    return await _service(request, session).student_progress(p.tenant_id, p.user_id)
