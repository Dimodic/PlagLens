"""Stepik-specific endpoints (§C)."""
from __future__ import annotations

import asyncio
from typing import Any

import httpx
from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters.stepik import fetch_steps, stepik_request
from integration_service.api.v1.configs import ensure_owner_or_admin
from integration_service.common.auth import Principal
from integration_service.common.kafka_bus import KafkaBus
from integration_service.common.problems import ProblemException, not_found, upstream_failed
from integration_service.config import get_settings
from integration_service.deps import bus_dep, principal_dep, session_dep
from integration_service.repositories import IntegrationConfigRepo
from integration_service.services.oauth import get_access_token
from integration_service.services.service_token import auth_headers as service_auth_headers
from integration_service.services.stepik_import import (
    drop_imported_stepik_homework,
    homework_exists,
    imported_stepik_homework_id,
    run_import_steps_as_homework,
    run_resync_stepik,
)
from integration_service.services.yc_import import (
    op_create,
    op_get,
    start_import_job,
)

router = APIRouter(prefix="/integrations/stepik", tags=["stepik"])


async def _get_cfg(
    config_id: str,
    p: Principal,
    session: AsyncSession,
    *,
    course_id: str | None = None,
):
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    if cfg.kind != "stepik":
        raise ProblemException(409, "CONFLICT", "Conflict", "config is not Stepik")
    # Tenant-wide config (course_id is None) authorises against the
    # destination course passed by the caller, mirroring Yandex.Contest.
    ensure_owner_or_admin(p, cfg.course_id or course_id)
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


# --------------------------------------------------------------------------- #
# Course tree (for manual step selection) + import-as-homework
# --------------------------------------------------------------------------- #
_LESSON_PAGE_CAP = 30
_MAX_TREE_STEPS = 600


@router.get("/{config_id}/courses/{stepik_course_id}/tree")
async def course_tree(
    config_id: str,
    stepik_course_id: int,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Lessons (titled) with their steps (id + position + type) so the import
    dialog can show a checkable tree for manual step selection."""
    cfg = await _get_cfg(config_id, p, session)
    token = await _token_for(cfg)
    course_name: str | None = None
    async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
        lessons: list[dict[str, Any]] = []
        page = 1
        try:
            while page <= _LESSON_PAGE_CAP:
                payload = await stepik_request(
                    client, token, "GET", "lessons",
                    params={"course": stepik_course_id, "page": page},
                )
                lessons.extend(payload.get("lessons", []) or [])
                if not payload.get("meta", {}).get("has_next"):
                    break
                page += 1
            # Course title — best-effort, for the import dialog's "name it
            # like the course" placeholder. Never fatal.
            try:
                cp = await stepik_request(
                    client, token, "GET", "courses",
                    params={"ids[]": [stepik_course_id]},
                )
                _courses = cp.get("courses") or []
                if _courses:
                    course_name = _courses[0].get("title") or None
            except httpx.HTTPError:
                course_name = None
            # step type + position. Stepik's /steps endpoint does NOT honour a
            # ``?course=`` filter (only ``?ids[]=`` / ``?lesson=``), so we
            # gather the step ids from each lesson's ordered ``steps`` array
            # and fetch them by id — that's the only way to get a real
            # position + block type per step.
            all_step_ids: list[int] = []
            for lesson in lessons:
                for sid in lesson.get("steps") or []:
                    try:
                        all_step_ids.append(int(sid))
                    except (TypeError, ValueError):
                        continue
            all_step_ids = all_step_ids[:_MAX_TREE_STEPS]
            step_meta: dict[int, dict[str, Any]] = {}
            if all_step_ids:
                for st in await fetch_steps(client, token, all_step_ids):
                    sid = st.get("id")
                    if sid is None:
                        continue
                    block = st.get("block") or {}
                    step_meta[int(sid)] = {
                        "type": block.get("name"),
                        "position": st.get("position"),
                    }
        except httpx.HTTPError as exc:
            raise upstream_failed("stepik", str(exc)) from exc

    tree: list[dict[str, Any]] = []
    for lesson in lessons:
        steps_out: list[dict[str, Any]] = []
        for idx, sid in enumerate(lesson.get("steps") or []):
            try:
                sid_int = int(sid)
            except (TypeError, ValueError):
                continue
            meta = step_meta.get(sid_int, {})
            pos = meta.get("position")
            steps_out.append(
                {
                    "id": sid_int,
                    "position": pos if pos is not None else idx + 1,
                    "type": meta.get("type"),
                }
            )
        tree.append(
            {
                "lesson_id": lesson.get("id"),
                "title": lesson.get("title") or f"Урок {lesson.get('id')}",
                "steps": steps_out,
            }
        )
    return {"data": tree, "name": course_name}


@router.get("/import-operations/{op_id}")
async def get_import_operation(op_id: str) -> dict[str, Any]:
    """Poll endpoint for the import modal (Redis-backed op state, 24h TTL)."""
    state = await op_get(op_id)
    if state is None:
        return {"status": "expired", "stage": None}
    return state


class _StepikImportBody(BaseModel):
    course_id: str
    stepik_course_id: int | str
    step_ids: list[int]
    title: str | None = None


def _snapshot_cfg(cfg: Any, course_id: str):
    """Detach the fields the background worker needs from the ORM row."""
    return type(
        "_CfgSnap",
        (),
        {
            "id": cfg.id,
            "tenant_id": cfg.tenant_id,
            "course_id": course_id,
            "settings": cfg.settings,
        },
    )()


@router.post("/{config_id}/import-as-homework")
async def import_as_homework(
    config_id: str,
    request: Request,
    body: _StepikImportBody = Body(...),
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Kick off an async one-shot import: the selected Stepik steps become a
    new homework's assignments and their submissions are pulled in. Returns
    202 + ``operation_id``; poll ``GET /import-operations/{op_id}``.

    Idempotent: re-importing the same Stepik course into the same PlagLens
    course resyncs submissions into the existing homework instead of creating
    a duplicate."""
    cfg = await _get_cfg(config_id, p, session, course_id=body.course_id)
    if not body.step_ids:
        raise ProblemException(
            400, "STEPS_REQUIRED", "step_ids required", "Select at least one step"
        )
    # Probe token presence early so the modal fails fast with a clear message.
    await _token_for(cfg)
    cfg_snap = _snapshot_cfg(cfg, body.course_id)
    _ = request  # token rides via the cached service token in the worker

    existing = imported_stepik_homework_id(cfg, body.stepik_course_id, body.course_id)
    if existing:
        s = get_settings()
        fwd = {**(await service_auth_headers()), "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
            alive = await homework_exists(
                client, settings=s, homework_id=existing, fwd_headers=fwd
            )
        if alive:
            op_id = await op_create({
                "stage": "starting",
                "status": "running",
                "course_id": body.course_id,
                "stepik_course_id": body.stepik_course_id,
                "homework_id": existing,
                "problems_total": 0,
                "problems_done": 0,
                "submissions_fetched": 0,
                "submissions_imported": 0,
                "errors": [],
                "resync": True,
            })
            job_id = await start_import_job(
                config_id=str(cfg.id),
                tenant_id=str(cfg.tenant_id),
                scope={
                    "stepik_course_id": body.stepik_course_id,
                    "course_id": body.course_id,
                    "mode": "resync",
                },
                trigger="manual",
            )
            asyncio.create_task(
                run_resync_stepik(
                    op_id=op_id,
                    cfg=cfg_snap,
                    course_id=body.course_id,
                    stepik_course_id=body.stepik_course_id,
                    homework_id=str(existing),
                    job_id=job_id,
                )
            )
            return {
                "operation_id": op_id,
                "status_url": f"/api/v1/integrations/stepik/import-operations/{op_id}",
                "already_imported": True,
                "homework_id": existing,
            }
        await drop_imported_stepik_homework(
            config_id=str(cfg.id),
            stepik_course_id=body.stepik_course_id,
            course_id=body.course_id,
        )

    op_id = await op_create({
        "stage": "starting",
        "status": "running",
        "course_id": body.course_id,
        "stepik_course_id": body.stepik_course_id,
        "homework_id": None,
        "homework_slug": None,
        "homework_title": None,
        "problems_total": len(body.step_ids),
        "problems_done": 0,
        "submissions_fetched": 0,
        "submissions_imported": 0,
        "errors": [],
    })
    job_id = await start_import_job(
        config_id=str(cfg.id),
        tenant_id=str(cfg.tenant_id),
        scope={
            "stepik_course_id": body.stepik_course_id,
            "course_id": body.course_id,
            "step_ids": body.step_ids,
            "mode": "import_as_homework",
        },
        trigger="manual",
    )
    asyncio.create_task(
        run_import_steps_as_homework(
            op_id=op_id,
            cfg=cfg_snap,
            course_id=body.course_id,
            stepik_course_id=body.stepik_course_id,
            step_ids=list(body.step_ids),
            title=body.title,
            job_id=job_id,
        )
    )
    return {
        "operation_id": op_id,
        "status_url": f"/api/v1/integrations/stepik/import-operations/{op_id}",
    }
