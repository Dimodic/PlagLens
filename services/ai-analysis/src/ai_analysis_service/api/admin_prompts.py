"""Admin endpoints for prompt versions."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select, update

from ..common.problem import conflict, not_found
from ..deps import PrincipalDep, SessionDep
from ..models import AIAnalysis, PromptVersion
from ..schemas import (
    PromptVersionCreate,
    PromptVersionOut,
    PromptVersionTestRequest,
    PromptVersionUpdate,
)
from ._helpers import auth_admin

router = APIRouter(prefix="/api/v1/admin/ai")


def _to_out(row: PromptVersion) -> PromptVersionOut:
    return PromptVersionOut(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        system_prompt=row.system_prompt,
        user_template=row.user_template,
        json_schema=row.json_schema,
        active_for_tenant=row.active_for_tenant,
        created_at=row.created_at,
        deactivated_at=row.deactivated_at,
    )


@router.get("/prompt-versions", response_model=list[PromptVersionOut])
async def list_prompt_versions(
    principal: PrincipalDep,
    session: SessionDep,
    active: bool | None = Query(default=None),
) -> list[PromptVersionOut]:
    auth_admin(principal)
    stmt = select(PromptVersion).where(
        PromptVersion.tenant_id == principal.tenant_id,
        PromptVersion.deleted_at.is_(None),
    )
    if active is True:
        stmt = stmt.where(PromptVersion.active_for_tenant.is_(True))
    if active is False:
        stmt = stmt.where(PromptVersion.active_for_tenant.is_(False))
    rows = list((await session.execute(stmt)).scalars())
    return [_to_out(r) for r in rows]


@router.post(
    "/prompt-versions",
    response_model=PromptVersionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_prompt_version(
    body: PromptVersionCreate, principal: PrincipalDep, session: SessionDep
) -> PromptVersionOut:
    auth_admin(principal)
    existing = await session.get(PromptVersion, body.id)
    if existing is not None and existing.tenant_id == principal.tenant_id:
        raise conflict(f"prompt version {body.id} already exists")
    row = PromptVersion(
        id=body.id,
        tenant_id=principal.tenant_id,
        name=body.name,
        system_prompt=body.system_prompt,
        user_template=body.user_template,
        json_schema=body.json_schema,
        active_for_tenant=False,
    )
    session.add(row)
    await session.commit()
    return _to_out(row)


@router.get(
    "/prompt-versions/{version_id}", response_model=PromptVersionOut
)
async def get_prompt_version(
    version_id: str, principal: PrincipalDep, session: SessionDep
) -> PromptVersionOut:
    auth_admin(principal)
    row = await session.get(PromptVersion, version_id)
    if row is None or row.tenant_id != principal.tenant_id or row.deleted_at:
        raise not_found("prompt version")
    return _to_out(row)


@router.patch(
    "/prompt-versions/{version_id}", response_model=PromptVersionOut
)
async def update_prompt_version(
    version_id: str,
    body: PromptVersionUpdate,
    principal: PrincipalDep,
    session: SessionDep,
) -> PromptVersionOut:
    auth_admin(principal)
    row = await session.get(PromptVersion, version_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise not_found("prompt version")
    used = (
        await session.execute(
            select(func.count())
            .select_from(AIAnalysis)
            .where(
                AIAnalysis.tenant_id == principal.tenant_id,
                AIAnalysis.prompt_version == version_id,
            )
        )
    ).scalar_one() or 0
    if used > 0:
        raise conflict("cannot edit prompt version that has been used")
    if body.name is not None:
        row.name = body.name
    if body.system_prompt is not None:
        row.system_prompt = body.system_prompt
    if body.user_template is not None:
        row.user_template = body.user_template
    if body.json_schema is not None:
        row.json_schema = body.json_schema
    await session.commit()
    return _to_out(row)


@router.post(
    "/prompt-versions/{version_id}:activate", response_model=PromptVersionOut
)
async def activate_prompt_version(
    version_id: str, principal: PrincipalDep, session: SessionDep
) -> PromptVersionOut:
    auth_admin(principal)
    row = await session.get(PromptVersion, version_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise not_found("prompt version")
    await session.execute(
        update(PromptVersion)
        .where(
            PromptVersion.tenant_id == principal.tenant_id,
            PromptVersion.id != version_id,
            PromptVersion.active_for_tenant.is_(True),
        )
        .values(active_for_tenant=False, deactivated_at=datetime.now(UTC))
    )
    row.active_for_tenant = True
    row.deactivated_at = None
    await session.commit()
    return _to_out(row)


@router.post("/prompt-versions/{version_id}:test")
async def test_prompt_version(
    version_id: str,
    body: PromptVersionTestRequest,
    principal: PrincipalDep,
    session: SessionDep,
) -> dict[str, Any]:
    """Dry-run probe of a prompt version. Connect orchestrator + submission
    code fetcher in deployment to make this issue a real LLM call."""
    auth_admin(principal)
    row = await session.get(PromptVersion, version_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise not_found("prompt version")
    return {
        "analysis_id": "test_dryrun",
        "submission_id": body.submission_id,
        "prompt_version": version_id,
        "note": "dry-run only",
    }


@router.get("/prompt-versions/{version_id}/usage")
async def prompt_version_usage(
    version_id: str, principal: PrincipalDep, session: SessionDep
) -> dict[str, Any]:
    auth_admin(principal)
    stmt = (
        select(
            func.count().label("total"),
            func.sum(AIAnalysis.total_tokens).label("tokens"),
        )
        .where(
            AIAnalysis.tenant_id == principal.tenant_id,
            AIAnalysis.prompt_version == version_id,
        )
    )
    res = (await session.execute(stmt)).one()
    return {
        "version_id": version_id,
        "total_uses": int(res.total or 0),
        "total_tokens": int(res.tokens or 0),
    }
