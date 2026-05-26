"""§F — provider management."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.ids import provider_config_id
from ...common.problem import forbidden, not_found
from ...common.rbac import Principal
from ...models.plagiarism import PlagiarismRun
from ...providers import get_provider
from ...repositories.provider_repo import ProviderRepository
from ...schemas.providers import (
    ProviderAdmin,
    ProviderTestResponse,
    ProviderUpdate,
    ProviderUsage,
)
from ..deps import get_db, get_principal_dep

router = APIRouter(prefix="/admin/plagiarism/providers", tags=["provider-admin"])

# Only Dolos ships as a working adapter. Adding another engine means
# (a) drop a new ``PlagiarismProvider`` subclass under ``providers/``,
# (b) register it in ``providers/__init__.py:get_provider``, and
# (c) append its name here so it shows up in the admin Providers page.
_KNOWN = ("dolos",)


def _ensure_admin(principal: Principal) -> None:
    if not principal.is_admin():
        raise forbidden("Admin role required")


@router.get("")
async def list_providers(
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _ensure_admin(principal)
    repo = ProviderRepository(db)
    db_cfgs = {cfg.provider: cfg for cfg in await repo.list_for_tenant(tenant_id=principal.tenant_id)}
    rows: list[ProviderAdmin] = []
    for name in _KNOWN:
        try:
            inst = get_provider(name)
        except ValueError:
            continue
        cfg = db_cfgs.get(name)
        rows.append(
            ProviderAdmin(
                provider=name,
                enabled=cfg.enabled if cfg else True,
                default_for_tenant=cfg.default_for_tenant if cfg else False,
                settings=(cfg.settings if cfg else {}),
                capabilities={
                    "languages": list(inst.capabilities.languages),
                    "supports_clusters": inst.capabilities.supports_clusters,
                    "supports_cancel": inst.capabilities.supports_cancel,
                    "supports_webhook": inst.capabilities.supports_webhook,
                    "polling_interval_seconds": inst.capabilities.polling_interval_seconds,
                },
            )
        )
    return {"data": [r.model_dump() for r in rows]}


@router.get("/{provider}", response_model=ProviderAdmin)
async def get_one_provider(
    provider: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> ProviderAdmin:
    _ensure_admin(principal)
    if provider not in _KNOWN:
        raise not_found(f"Provider {provider} unknown")
    repo = ProviderRepository(db)
    cfg = await repo.get(tenant_id=principal.tenant_id, provider=provider)
    inst = get_provider(provider)
    return ProviderAdmin(
        provider=provider,
        enabled=cfg.enabled if cfg else True,
        default_for_tenant=cfg.default_for_tenant if cfg else False,
        settings=(cfg.settings if cfg else {}),
        capabilities={
            "languages": list(inst.capabilities.languages),
            "supports_clusters": inst.capabilities.supports_clusters,
        },
    )


@router.patch("/{provider}", response_model=ProviderAdmin)
async def update_provider(
    provider: str,
    body: ProviderUpdate,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> ProviderAdmin:
    _ensure_admin(principal)
    if provider not in _KNOWN:
        raise not_found(f"Provider {provider} unknown")
    repo = ProviderRepository(db)
    cfg = await repo.upsert(
        config_id=provider_config_id(),
        tenant_id=principal.tenant_id,
        provider=provider,
        enabled=body.enabled,
        settings=body.settings,
        credentials_secret_ref=body.credentials_secret_ref,
    )
    await db.commit()
    inst = get_provider(provider)
    return ProviderAdmin(
        provider=provider,
        enabled=cfg.enabled,
        default_for_tenant=cfg.default_for_tenant,
        settings=cfg.settings or {},
        capabilities={"languages": list(inst.capabilities.languages)},
    )


@router.post("/{provider}:test", response_model=ProviderTestResponse)
async def test_provider(
    provider: str,
    principal: Principal = Depends(get_principal_dep),
) -> ProviderTestResponse:
    _ensure_admin(principal)
    if provider not in _KNOWN:
        raise not_found(f"Provider {provider} unknown")
    inst = get_provider(provider)
    return ProviderTestResponse(
        provider=provider,
        ok=True,
        detail=f"Provider {provider} is registered",
        capabilities={
            "languages": list(inst.capabilities.languages),
            "supports_clusters": inst.capabilities.supports_clusters,
        },
    )


@router.post("/{provider}:set-default", response_model=ProviderAdmin)
async def set_default_provider(
    provider: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> ProviderAdmin:
    _ensure_admin(principal)
    if provider not in _KNOWN:
        raise not_found(f"Provider {provider} unknown")
    repo = ProviderRepository(db)
    cfg = await repo.set_default(tenant_id=principal.tenant_id, provider=provider)
    if cfg is None:
        # auto-create then mark default
        cfg = await repo.upsert(
            config_id=provider_config_id(),
            tenant_id=principal.tenant_id,
            provider=provider,
            enabled=True,
        )
        cfg = await repo.set_default(tenant_id=principal.tenant_id, provider=provider)
    await db.commit()
    inst = get_provider(provider)
    return ProviderAdmin(
        provider=provider,
        enabled=cfg.enabled if cfg else True,
        default_for_tenant=True,
        settings=cfg.settings if cfg else {},
        capabilities={"languages": list(inst.capabilities.languages)},
    )


@router.get("/{provider}/usage", response_model=ProviderUsage)
async def provider_usage(
    provider: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> ProviderUsage:
    _ensure_admin(principal)
    if provider not in _KNOWN:
        raise not_found(f"Provider {provider} unknown")
    stmt = select(PlagiarismRun).where(
        PlagiarismRun.tenant_id == principal.tenant_id,
        PlagiarismRun.provider == provider,
    )
    res = await db.execute(stmt)
    runs = list(res.scalars().all())
    completed = [r for r in runs if r.status == "completed"]
    failed = [r for r in runs if r.status == "failed"]
    durations: list[float] = []
    for r in completed:
        if r.started_at and r.finished_at:
            durations.append((r.finished_at - r.started_at).total_seconds())
    last = max((r.created_at for r in runs), default=None)
    return ProviderUsage(
        provider=provider,
        runs_total=len(runs),
        runs_completed=len(completed),
        runs_failed=len(failed),
        avg_duration_seconds=(sum(durations) / len(durations)) if durations else 0.0,
        last_run_at=last.isoformat() if last else None,
    )
