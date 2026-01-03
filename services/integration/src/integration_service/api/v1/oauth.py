"""OAuth flow endpoints (§B)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.api.v1.configs import ensure_owner_or_admin
from integration_service.common.auth import Principal
from integration_service.common.problems import ProblemException, not_found
from integration_service.deps import principal_dep, session_dep
from integration_service.repositories import IntegrationConfigRepo
from integration_service.services.oauth import (
    build_authorize_url,
    consume_state,
    create_state,
    delete_tokens,
    exchange_code,
    get_provider_for_tenant,
    get_refresh_token,
    refresh_token,
    store_tokens,
)

router = APIRouter(prefix="/integrations", tags=["oauth"])


@router.get("/oauth/finalize")
async def oauth_finalize(
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(session_dep),
) -> JSONResponse:
    """Generic OAuth callback for frontends that own the redirect_uri.

    Used when the OAuth provider redirects to the frontend (e.g. Yandex →
    `http://localhost:5173/auth/oauth/callback?code&state`). The frontend then
    POSTs/GETs here so the backend can run the token exchange. Unlike the
    config-bound `/{config_id}/oauth/callback`, this endpoint extracts the
    binding from `state` alone (the state payload contains config_id +
    tenant_id), which is what we sign and store in Redis at `start` time.
    """
    if error:
        return JSONResponse(status_code=400, content={"error": error})
    if not (code and state):
        raise ProblemException(400, "BAD_REQUEST", "Bad Request", "code and state required")
    payload = await consume_state(state)
    if payload is None:
        raise ProblemException(400, "BAD_REQUEST", "Bad Request", "invalid or expired state")
    config_id = payload.get("config_id")
    tenant_id = payload.get("tenant_id")
    if not (config_id and tenant_id):
        raise ProblemException(400, "BAD_REQUEST", "Bad Request", "state payload incomplete")
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    provider = await get_provider_for_tenant(cfg.kind, cfg.tenant_id, cfg)
    if provider is None:
        raise ProblemException(409, "CONFLICT", "Conflict", "provider missing")
    tokens = await exchange_code(provider, code)
    await store_tokens(cfg.id, tokens)
    cfg.status = "active"
    cfg.credentials_secret_ref = f"redis://oauth:token:{cfg.id}"
    await session.commit()
    _ = request
    return JSONResponse(
        {
            "status": "ok",
            "config_id": cfg.id,
            "kind": cfg.kind,
            "active": True,
        }
    )


@router.get("/{config_id}/oauth/start")
async def oauth_start(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, str]:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    provider = await get_provider_for_tenant(cfg.kind, cfg.tenant_id, cfg)
    if provider is None or not provider.client_id:
        raise ProblemException(409, "CONFLICT", "Conflict", "OAuth provider not configured")
    state = await create_state(cfg.id, p.tenant_id)
    url = build_authorize_url(provider, state)
    return {"authorize_url": url, "state": state}


@router.get("/{config_id}/oauth/callback")
async def oauth_callback(
    config_id: str,
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(session_dep),
) -> JSONResponse:
    """Public, state-validated callback. ``config_id`` in path is informational
    — actual binding lives in ``state`` payload (config_id + tenant_id)."""
    if error:
        return JSONResponse(status_code=400, content={"error": error})
    if not (code and state):
        raise ProblemException(400, "BAD_REQUEST", "Bad Request", "code and state required")
    payload = await consume_state(state)
    if payload is None:
        raise ProblemException(400, "BAD_REQUEST", "Bad Request", "invalid or expired state")
    target_id = payload.get("config_id")
    tenant_id = payload.get("tenant_id")
    if target_id != config_id:
        # Spec says state binds to a config; reject mismatched callbacks.
        raise ProblemException(400, "BAD_REQUEST", "Bad Request", "state/config mismatch")
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(target_id, tenant_id=tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", target_id)
    provider = await get_provider_for_tenant(cfg.kind, cfg.tenant_id, cfg)
    if provider is None:
        raise ProblemException(409, "CONFLICT", "Conflict", "provider missing")
    tokens = await exchange_code(provider, code)
    await store_tokens(cfg.id, tokens)
    cfg.status = "active"
    cfg.credentials_secret_ref = f"redis://oauth:token:{cfg.id}"
    await session.commit()
    _ = request
    return JSONResponse({"status": "ok", "config_id": cfg.id, "active": True})


@router.post("/{config_id}/oauth/refresh", status_code=status.HTTP_200_OK)
async def oauth_refresh(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, bool]:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    provider = await get_provider_for_tenant(cfg.kind, cfg.tenant_id, cfg)
    if provider is None:
        raise ProblemException(409, "CONFLICT", "Conflict", "provider missing")
    rt = await get_refresh_token(cfg.id)
    if not rt:
        raise ProblemException(409, "CONFLICT", "Conflict", "no refresh token stored")
    tokens = await refresh_token(provider, rt)
    await store_tokens(cfg.id, tokens)
    return {"refreshed": True}


@router.delete("/{config_id}/oauth/disconnect")
async def oauth_disconnect(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, bool]:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    ensure_owner_or_admin(p, cfg.course_id)
    await delete_tokens(cfg.id)
    cfg.status = "pending_auth"
    cfg.credentials_secret_ref = None
    await session.commit()
    return {"disconnected": True}
