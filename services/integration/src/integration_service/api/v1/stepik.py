"""Stepik-specific endpoints (§C)."""
from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters.stepik import stepik_request
from integration_service.api.v1.configs import ensure_owner_or_admin
from integration_service.common.auth import Principal
from integration_service.common.kafka_bus import KafkaBus
from integration_service.common.problems import ProblemException, not_found, upstream_failed
from integration_service.config import get_settings
from integration_service.deps import bus_dep, principal_dep, session_dep
from integration_service.repositories import IntegrationConfigRepo
from integration_service.services.oauth import get_access_token

router = APIRouter(prefix="/integrations/stepik", tags=["stepik"])


async def _get_cfg(config_id: str, p: Principal, session: AsyncSession):
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    if cfg.kind != "stepik":
        raise ProblemException(409, "CONFLICT", "Conflict", "config is not Stepik")
    ensure_owner_or_admin(p, cfg.course_id)
    return cfg


async def _token_for(cfg: Any) -> str:
    token = await get_access_token(cfg.id)
    if token:
        return token
    s = (cfg.settings or {})
    static = s.get("static_token") if isinstance(s, dict) else None
    if static:
        return str(static)
    raise ProblemException(409, "CONFLICT", "Conflict", "no Stepik access token")


@router.get("/{config_id}/courses")
async def list_courses(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    cfg = await _get_cfg(config_id, p, session)
    token = await _token_for(cfg)
    async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
        try:
            payload = await stepik_request(client, token, "GET", "courses")
        except httpx.HTTPError as exc:
            raise upstream_failed("stepik", str(exc)) from exc
    return {"data": payload.get("courses", []), "meta": payload.get("meta", {})}


@router.get("/{config_id}/courses/{stepik_course_id}/lessons")
async def list_lessons(
    config_id: str,
    stepik_course_id: int,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    cfg = await _get_cfg(config_id, p, session)
    token = await _token_for(cfg)
    async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
        try:
            payload = await stepik_request(
                client, token, "GET", "lessons", params={"course": stepik_course_id}
            )
        except httpx.HTTPError as exc:
            raise upstream_failed("stepik", str(exc)) from exc
    return {"data": payload.get("lessons", []), "meta": payload.get("meta", {})}


@router.get("/{config_id}/courses/{stepik_course_id}/steps")
async def list_steps(
    config_id: str,
    stepik_course_id: int,
    type_: str = Query(default="code", alias="type"),
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    cfg = await _get_cfg(config_id, p, session)
    token = await _token_for(cfg)
    async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
        try:
            payload = await stepik_request(
                client,
                token,
                "GET",
                "steps",
                params={"course": stepik_course_id, "type": type_},
            )
        except httpx.HTTPError as exc:
            raise upstream_failed("stepik", str(exc)) from exc
    return {"data": payload.get("steps", []), "meta": payload.get("meta", {})}


@router.get("/{config_id}/steps/{stepik_step_id}/preview")
async def preview_step(
    config_id: str,
    stepik_step_id: int,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    cfg = await _get_cfg(config_id, p, session)
    token = await _token_for(cfg)
    async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
        try:
            payload = await stepik_request(client, token, "GET", f"steps/{stepik_step_id}")
        except httpx.HTTPError as exc:
            raise upstream_failed("stepik", str(exc)) from exc
    items = payload.get("steps", []) if isinstance(payload, dict) else []
    return items[0] if items else {}


@router.post("/{config_id}/sync-course-structure")
async def sync_course_structure(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> dict[str, Any]:
    cfg = await _get_cfg(config_id, p, session)
    token = await _token_for(cfg)
    course_ids = []
    if isinstance(cfg.settings, dict):
        course_ids = cfg.settings.get("stepik_course_ids", [])
    structure = []
    async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
        for cid in course_ids:
            try:
                payload = await stepik_request(client, token, "GET", f"courses/{cid}")
                structure.append(payload)
            except httpx.HTTPError as exc:
                structure.append({"course_id": cid, "error": str(exc)})
    await bus.publish(
        get_settings().kafka_topic_integration_config,
        "integration.config.updated.v1",
        {"config_id": cfg.id, "operation": "sync-course-structure"},
        tenant_id=p.tenant_id,
        actor={"type": "user", "id": p.user_id},
    )
    return {"ok": True, "courses": structure, "registered_assignments": []}
