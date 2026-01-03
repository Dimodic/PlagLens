"""Cursor management (§K)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.common.auth import Principal
from integration_service.common.problems import ProblemException, not_found
from integration_service.deps import principal_dep, session_dep
from integration_service.repositories import IntegrationConfigRepo

router = APIRouter(prefix="/integrations", tags=["cursor"])


def _admin_or_owner(p: Principal, course_id: str | None) -> None:
    if p.is_admin or p.is_super_admin:
        return
    if course_id and p.course_role(course_id) == "owner":
        return
    raise ProblemException(403, "FORBIDDEN", "Forbidden", "admin or owner required")


@router.get("/{config_id}/cursor")
async def get_cursor(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    _admin_or_owner(p, cfg.course_id)
    return {"cursor": cfg.cursor or {}}


@router.post("/{config_id}/cursor:reset")
async def reset_cursor(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    _admin_or_owner(p, cfg.course_id)
    cfg.cursor = {}
    await session.commit()
    return {"ok": True, "cursor": {}}


@router.post("/{config_id}/cursor:set")
async def set_cursor(
    config_id: str,
    payload: dict[str, Any],
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    if not p.is_admin and not p.is_super_admin:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "admin required")
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    cfg.cursor = payload.get("value", {}) or {}
    await session.commit()
    return {"ok": True, "cursor": cfg.cursor}
