"""Budget configuration + usage endpoints."""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter

from ..common.auth import require_admin, require_teacher_or_assistant
from ..common.problem import not_found
from ..deps import PrincipalDep, SessionDep
from ..schemas import BudgetOut, BudgetUpdate, UsageOut
from ..services.budgets import BudgetService

router = APIRouter(prefix="/api/v1")


def _to_budget_out(cfg) -> BudgetOut:
    return BudgetOut(
        id=cfg.id,
        scope=cfg.scope,
        scope_id=cfg.scope_id,
        period=cfg.period,
        max_tokens=cfg.max_tokens,
        max_cost=cfg.max_cost,
        soft_warn_at=cfg.soft_warn_at,
        hard_stop_at=cfg.hard_stop_at,
        reset_at=cfg.reset_at,
    )


def _to_usage_out(scope: str, scope_id: str, usage) -> UsageOut:
    return UsageOut(
        scope=scope,
        scope_id=scope_id,
        period=usage.period,
        period_start=usage.period_start,
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        total_tokens=usage.total_tokens,
        total_cost=usage.total_cost,
        analyses_count=usage.analyses_count,
        cache_hits=usage.cache_hits,
    )


# ---- Tenant ----

@router.get("/tenants/{tenant_id}/ai/budget", response_model=BudgetOut)
async def get_tenant_budget(
    tenant_id: str, principal: PrincipalDep, session: SessionDep
) -> BudgetOut:
    require_admin(principal)
    if tenant_id != principal.tenant_id and principal.global_role != "admin":
        raise not_found("tenant scope")
    svc = BudgetService(session)
    cfg = await svc.get_config("tenant", tenant_id)
    if cfg is None:
        # No budget configured yet — return an unconfigured stub instead of 404
        # so the admin UI can render "no budget set" without flashing an error.
        return BudgetOut(
            id="",
            scope="tenant",
            scope_id=tenant_id,
            period="month",
            max_tokens=None,
            max_cost=None,
            soft_warn_at=Decimal("0.8"),
            hard_stop_at=Decimal("1.0"),
            reset_at=None,
        )
    return _to_budget_out(cfg)


@router.patch("/tenants/{tenant_id}/ai/budget", response_model=BudgetOut)
async def patch_tenant_budget(
    tenant_id: str,
    body: BudgetUpdate,
    principal: PrincipalDep,
    session: SessionDep,
) -> BudgetOut:
    require_admin(principal)
    if tenant_id != principal.tenant_id and principal.global_role != "admin":
        raise not_found("tenant scope")
    svc = BudgetService(session)
    cfg = await svc.upsert_config(
        scope="tenant",
        scope_id=tenant_id,
        period=body.period or "month",
        max_tokens=body.max_tokens,
        max_cost=body.max_cost,
        soft_warn_at=body.soft_warn_at,
    )
    await session.commit()
    return _to_budget_out(cfg)


@router.get("/tenants/{tenant_id}/ai/usage", response_model=UsageOut)
async def tenant_usage(
    tenant_id: str, principal: PrincipalDep, session: SessionDep
) -> UsageOut:
    require_admin(principal)
    if tenant_id != principal.tenant_id and principal.global_role != "admin":
        raise not_found("tenant scope")
    svc = BudgetService(session)
    cfg, usage = await svc.usage_for("tenant", tenant_id)
    if cfg is None or usage is None:
        # No usage rows yet — zero-state response so the LLM/Budgets pages
        # render an empty meter instead of a 404 + error alert.
        return UsageOut(
            scope="tenant",
            scope_id=tenant_id,
            period="month",
            period_start=datetime.now(UTC),
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            total_cost=Decimal("0"),
            analyses_count=0,
            cache_hits=0,
        )
    await session.commit()
    return _to_usage_out("tenant", tenant_id, usage)


# ---- Course ----

@router.get("/courses/{course_id}/ai/budget", response_model=BudgetOut)
async def get_course_budget(
    course_id: str, principal: PrincipalDep, session: SessionDep
) -> BudgetOut:
    require_teacher_or_assistant(principal, course_id, allow_global=("admin",))
    svc = BudgetService(session)
    cfg = await svc.get_config("course", course_id)
    if cfg is None:
        return BudgetOut(
            id="",
            scope="course",
            scope_id=course_id,
            period="month",
            max_tokens=None,
            max_cost=None,
            soft_warn_at=Decimal("0.8"),
            hard_stop_at=Decimal("1.0"),
            reset_at=None,
        )
    return _to_budget_out(cfg)


@router.patch("/courses/{course_id}/ai/budget", response_model=BudgetOut)
async def patch_course_budget(
    course_id: str,
    body: BudgetUpdate,
    principal: PrincipalDep,
    session: SessionDep,
) -> BudgetOut:
    require_teacher_or_assistant(principal, course_id, allow_global=("admin",))
    svc = BudgetService(session)
    cfg = await svc.upsert_config(
        scope="course",
        scope_id=course_id,
        period=body.period or "month",
        max_tokens=body.max_tokens,
        max_cost=body.max_cost,
        soft_warn_at=body.soft_warn_at,
    )
    await session.commit()
    return _to_budget_out(cfg)


@router.get("/courses/{course_id}/ai/usage", response_model=UsageOut)
async def course_usage(
    course_id: str, principal: PrincipalDep, session: SessionDep
) -> UsageOut:
    require_teacher_or_assistant(principal, course_id, allow_global=("admin",))
    svc = BudgetService(session)
    cfg, usage = await svc.usage_for("course", course_id)
    if cfg is None or usage is None:
        return UsageOut(
            scope="course",
            scope_id=course_id,
            period="month",
            period_start=datetime.now(UTC),
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            total_cost=Decimal("0"),
            analyses_count=0,
            cache_hits=0,
        )
    await session.commit()
    return _to_usage_out("course", course_id, usage)


# ---- Per-user (optional) ----

@router.get("/users/me/ai/usage")
async def user_usage(
    principal: PrincipalDep, session: SessionDep
) -> dict[str, Any]:
    svc = BudgetService(session)
    cfg, usage = await svc.usage_for("user", principal.user_id)
    if cfg is None or usage is None:
        return {
            "scope": "user",
            "scope_id": principal.user_id,
            "configured": False,
            "total_tokens": 0,
            "total_cost": "0",
        }
    return _to_usage_out("user", principal.user_id, usage).model_dump()
