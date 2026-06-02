"""eJudge-specific endpoints — problem listing + import-as-homework.

Mirrors the Yandex.Contest / Stepik surface: list a contest's problems so the
teacher can tick which to import, then kick off an async import-as-homework job
(homework + assignments from the selected problems + their runs as submissions).
"""
from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Any

import httpx
from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters.ejudge import EjudgeAdapter
from integration_service.api.v1.configs import ensure_owner_or_admin
from integration_service.common.auth import Principal
from integration_service.common.problems import ProblemException, not_found
from integration_service.config import get_settings
from integration_service.deps import principal_dep, session_dep
from integration_service.repositories import IntegrationConfigRepo
from integration_service.services.ejudge_import import (
    homework_exists,
    imported_ejudge_homework_id,
    run_import_as_homework,
)
from integration_service.services.service_token import auth_headers as service_auth_headers
from integration_service.services.yc_import import op_create, op_get, start_import_job

router = APIRouter(prefix="/integrations/ejudge", tags=["ejudge"])


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
    if cfg.kind != "ejudge":
        raise ProblemException(409, "CONFLICT", "Conflict", "config is not eJudge")
    ensure_owner_or_admin(p, cfg.course_id or course_id)
    return cfg


@router.get("/{config_id}/contests/{contest_id}/problems")
async def list_problems(
    config_id: str,
    contest_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    cfg = await _get_cfg(config_id, p, session)
    adapter = EjudgeAdapter()
    res = await adapter.import_problems(cfg, {"contest_id": contest_id})
    return {
        "data": [asdict(pr) for pr in res.problems],
        "imported": res.imported,
        "failed": res.failed,
        "errors": res.errors,
    }


@router.get("/import-operations/{op_id}")
async def get_import_operation(op_id: str) -> dict[str, Any]:
    state = await op_get(op_id)
    if state is None:
        return {"status": "expired", "stage": None}
    return state


class _EjudgeImportBody(BaseModel):
    course_id: str
    contest_id: int | str
    problem_aliases: list[str] | None = None
    title: str | None = None


def _snapshot_cfg(cfg: Any, course_id: str):
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
    body: _EjudgeImportBody = Body(...),
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    cfg = await _get_cfg(config_id, p, session, course_id=body.course_id)
    _ = request
    snap = _snapshot_cfg(cfg, body.course_id)

    # Idempotency: if this contest is already imported into this course and the
    # homework still lives, don't create a duplicate — point the caller at it.
    existing = imported_ejudge_homework_id(cfg, body.contest_id, body.course_id)
    if existing:
        s = get_settings()
        fwd = {**(await service_auth_headers()), "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
            alive = await homework_exists(
                client, settings=s, homework_id=existing, fwd_headers=fwd
            )
        if alive:
            return {
                "operation_id": None,
                "already_imported": True,
                "homework_id": existing,
            }

    op_id = await op_create({
        "stage": "starting",
        "status": "running",
        "course_id": body.course_id,
        "contest_id": body.contest_id,
        "homework_id": None,
        "homework_slug": None,
        "homework_title": None,
        "problems_total": len(body.problem_aliases or []),
        "problems_done": 0,
        "submissions_fetched": 0,
        "submissions_imported": 0,
        "errors": [],
    })
    job_id = await start_import_job(
        config_id=str(cfg.id),
        tenant_id=str(cfg.tenant_id),
        scope={
            "contest_id": body.contest_id,
            "course_id": body.course_id,
            "mode": "import_as_homework",
        },
        trigger="manual",
    )
    asyncio.create_task(
        run_import_as_homework(
            op_id=op_id,
            cfg=snap,
            contest_id=body.contest_id,
            job_id=job_id,
            problem_aliases=body.problem_aliases,
        )
    )
    return {
        "operation_id": op_id,
        "status_url": f"/api/v1/integrations/ejudge/import-operations/{op_id}",
    }
