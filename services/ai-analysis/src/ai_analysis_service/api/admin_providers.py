"""Admin endpoints for provider configuration."""
from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Response, status
from openai import AsyncOpenAI
from sqlalchemy import select, update

from ..common.ids import gen_id
from ..common.problem import not_found
from ..config import get_settings
from ..deps import PrincipalDep, SessionDep
from ..models import ProviderConfig
from ..schemas import (
    ProviderConfigCreate,
    ProviderConfigOut,
    ProviderConfigUpdate,
)
from ._helpers import auth_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/ai")


def _to_out(row: ProviderConfig) -> ProviderConfigOut:
    return ProviderConfigOut(
        id=row.id,
        tenant_id=row.tenant_id,
        provider=row.provider,
        base_url=row.base_url,
        model=row.model,
        enabled=row.enabled,
        default_for_tenant=row.default_for_tenant,
        priority=row.priority,
        rate_limit_rpm=row.rate_limit_rpm,
        max_tokens=row.max_tokens,
        supports_json_schema=row.supports_json_schema,
        api_key_env_var=getattr(row, "api_key_env_var", None),
        settings=row.settings,
        last_success_at=row.last_success_at,
        error_count=row.error_count,
        created_at=row.created_at,
    )


@router.get("/providers", response_model=list[ProviderConfigOut])
async def list_providers(
    principal: PrincipalDep, session: SessionDep
) -> list[ProviderConfigOut]:
    auth_admin(principal)
    stmt = (
        select(ProviderConfig)
        .where(
            ProviderConfig.tenant_id == principal.tenant_id,
            ProviderConfig.deleted_at.is_(None),
        )
        .order_by(ProviderConfig.priority.asc())
    )
    rows = list((await session.execute(stmt)).scalars())
    return [_to_out(r) for r in rows]


@router.post(
    "/providers",
    response_model=ProviderConfigOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_provider(
    body: ProviderConfigCreate, principal: PrincipalDep, session: SessionDep
) -> ProviderConfigOut:
    auth_admin(principal)
    row = ProviderConfig(
        id=gen_id("pcf"),
        tenant_id=principal.tenant_id,
        provider=body.provider,
        base_url=body.base_url,
        model=body.model,
        api_key_secret_ref=body.api_key,
        api_key_env_var=body.api_key_env_var,
        enabled=True,
        default_for_tenant=False,
        priority=body.priority,
        rate_limit_rpm=body.rate_limit_rpm,
        max_tokens=body.max_tokens,
        supports_json_schema=body.supports_json_schema,
        settings=body.settings or {},
    )
    session.add(row)
    await session.commit()
    return _to_out(row)


@router.get("/providers/{provider_id}", response_model=ProviderConfigOut)
async def get_provider(
    provider_id: str, principal: PrincipalDep, session: SessionDep
) -> ProviderConfigOut:
    auth_admin(principal)
    row = await session.get(ProviderConfig, provider_id)
    if row is None or row.tenant_id != principal.tenant_id or row.deleted_at:
        raise not_found("provider")
    return _to_out(row)


@router.patch("/providers/{provider_id}", response_model=ProviderConfigOut)
async def update_provider(
    provider_id: str,
    body: ProviderConfigUpdate,
    principal: PrincipalDep,
    session: SessionDep,
) -> ProviderConfigOut:
    auth_admin(principal)
    row = await session.get(ProviderConfig, provider_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise not_found("provider")
    if body.base_url is not None:
        row.base_url = body.base_url
    if body.model is not None:
        row.model = body.model
    if body.api_key is not None:
        row.api_key_secret_ref = body.api_key
    if body.api_key_env_var is not None:
        row.api_key_env_var = body.api_key_env_var
    if body.priority is not None:
        row.priority = body.priority
    if body.rate_limit_rpm is not None:
        row.rate_limit_rpm = body.rate_limit_rpm
    if body.max_tokens is not None:
        row.max_tokens = body.max_tokens
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.supports_json_schema is not None:
        row.supports_json_schema = body.supports_json_schema
    if body.settings is not None:
        row.settings = body.settings
    await session.commit()
    return _to_out(row)


@router.delete(
    "/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_provider(
    provider_id: str, principal: PrincipalDep, session: SessionDep
) -> Response:
    auth_admin(principal)
    row = await session.get(ProviderConfig, provider_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise not_found("provider")
    row.deleted_at = datetime.now(UTC)
    row.enabled = False
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _resolve_provider_api_key(row: ProviderConfig) -> str | None:
    """Mirror orchestrator._resolve_api_key: env-var first, then secret_ref,
    then global fallback. Kept inline (instead of importing the orchestrator)
    to avoid pulling its full dependency graph into admin routes."""
    settings = get_settings()
    if row.api_key_env_var:
        from_env = os.environ.get(row.api_key_env_var)
        if from_env:
            return from_env
        attr = getattr(settings, row.api_key_env_var, None)
        if attr:
            return str(attr)
    if row.api_key_secret_ref:
        return row.api_key_secret_ref
    return settings.resolve_api_key()


@router.post("/providers/{provider_id}:test")
async def test_provider(
    provider_id: str, principal: PrincipalDep, session: SessionDep
) -> dict[str, Any]:
    """Real connectivity probe.

    Issues a 1-token chat completion against the provider's ``base_url`` with
    the configured ``model`` using the resolved API key. Returns latency on
    success or the upstream error code/message on failure.
    """
    auth_admin(principal)
    row = await session.get(ProviderConfig, provider_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise not_found("provider")

    api_key = _resolve_provider_api_key(row)
    if not api_key:
        return {
            "provider_id": provider_id,
            "ok": False,
            "error": "API key not configured (set api_key or api_key_env_var)",
        }

    client = AsyncOpenAI(
        base_url=row.base_url,
        api_key=api_key,
        timeout=10,
        max_retries=0,
    )
    started = time.perf_counter()
    try:
        resp = await client.chat.completions.create(
            model=row.model,
            messages=[{"role": "user", "content": "ping"}],
            # Some providers (e.g. GPT-5.x via OpenRouter) reject
            # max_output_tokens < 16; 16 is the smallest universally-accepted
            # value for a connectivity probe.
            max_tokens=16,
            temperature=0,
        )
    except Exception as exc:  # noqa: BLE001
        latency_ms = int((time.perf_counter() - started) * 1000)
        status_code = getattr(exc, "status_code", None) or getattr(
            getattr(exc, "response", None), "status_code", None
        )
        msg = str(exc).splitlines()[0][:300] if exc.args else exc.__class__.__name__
        logger.info(
            "provider %s test failed: status=%s err=%s", row.provider, status_code, msg
        )
        return {
            "provider_id": provider_id,
            "ok": False,
            "latency_ms": latency_ms,
            "error": f"{status_code or '?'}: {msg}" if status_code else msg,
        }

    latency_ms = int((time.perf_counter() - started) * 1000)
    sample = ""
    try:
        sample = resp.choices[0].message.content or ""
    except Exception:  # noqa: BLE001
        pass
    return {
        "provider_id": provider_id,
        "ok": True,
        "latency_ms": latency_ms,
        "model_response": sample[:80],
    }


@router.post(
    "/providers/{provider_id}:set-default", response_model=ProviderConfigOut
)
async def set_default(
    provider_id: str, principal: PrincipalDep, session: SessionDep
) -> ProviderConfigOut:
    auth_admin(principal)
    row = await session.get(ProviderConfig, provider_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise not_found("provider")
    await session.execute(
        update(ProviderConfig)
        .where(
            ProviderConfig.tenant_id == principal.tenant_id,
            ProviderConfig.id != provider_id,
            ProviderConfig.default_for_tenant.is_(True),
        )
        .values(default_for_tenant=False)
    )
    row.default_for_tenant = True
    await session.commit()
    return _to_out(row)


@router.get("/providers/{provider_id}/health")
async def provider_health(
    provider_id: str, principal: PrincipalDep, session: SessionDep
) -> dict[str, Any]:
    auth_admin(principal)
    row = await session.get(ProviderConfig, provider_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise not_found("provider")
    return {
        "provider_id": provider_id,
        "last_success_at": row.last_success_at,
        "error_count": row.error_count,
        "enabled": row.enabled,
    }
