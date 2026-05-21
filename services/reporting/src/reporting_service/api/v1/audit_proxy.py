"""Audit-proxy endpoints (§J)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.deps import get_session
from ...common.problem import forbidden
from ...common.rbac import Principal, get_principal

router = APIRouter(tags=["audit-proxy"])


@router.get("/courses/{course_id}/recent-activity")
async def recent_activity(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
):
    if not p.has_global("admin",) and not p.has_course_role(
        course_id, "owner", "co_owner", "assistant"
    ):
        raise forbidden("Not a teacher/assistant for this course")
    proxy = request.app.state.audit_proxy
    entries = await proxy.recent_for_course(p.tenant_id, course_id, limit)
    return {
        "data": entries,
        "pagination": {"next_cursor": None, "has_more": False, "limit": len(entries)},
    }


@router.get("/users/me/recent-activity")
async def my_recent_activity(
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
):
    proxy = request.app.state.audit_proxy
    entries = await proxy.recent_for_user(p.tenant_id, p.user_id, limit)
    return {
        "data": entries,
        "pagination": {"next_cursor": None, "has_more": False, "limit": len(entries)},
    }
