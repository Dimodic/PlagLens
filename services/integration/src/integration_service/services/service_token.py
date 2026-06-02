"""Cached admin service token issued by identity-service.

The integration-service uses this token as a Bearer in calls to identity /
course / submission endpoints when there's no incoming user request to
forward (background scheduler, webhook consumers, …). Cached in-process and
refreshed transparently before expiry.
"""
from __future__ import annotations

import asyncio
import time
from typing import Optional

import httpx
import structlog

from integration_service.config import get_settings

logger = structlog.get_logger(__name__)

_lock = asyncio.Lock()
_cached_token: Optional[str] = None
_cached_expires_at: float = 0.0
# Per-tenant impersonation tokens (system tenant uses the cache above).
# tenant_id -> (token, expires_at)
_tenant_lock = asyncio.Lock()
_tenant_tokens: dict[str, tuple[str, float]] = {}
SERVICE_NAME = "integration-service"


async def _mint(*, tenant_id: Optional[str]) -> tuple[str, float]:
    """Call identity ``/auth/service-token`` and return ``(token, expires_at)``.

    ``tenant_id`` is passed through to identity so the minted JWT carries that
    tenant — needed when a downstream service scopes its writes by the token's
    tenant (not the request body), e.g. submission's ``:claim-external`` /
    ``:migrate-external-authors``. Omitted → identity's default ``system``.
    """
    s = get_settings()
    url = s.identity_service_url.rstrip("/") + "/api/v1/auth/service-token"
    body: dict[str, str] = {"service_name": SERVICE_NAME}
    if tenant_id:
        body["tenant_id"] = tenant_id
    async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
        resp = await client.post(
            url,
            headers={"X-Service-Secret": s.service_auth_secret},
            json=body,
        )
        if resp.status_code >= 400:
            logger.error(
                "service_token.fetch_failed",
                status=resp.status_code,
                body=resp.text[:300],
            )
            raise RuntimeError(
                f"identity service-token endpoint returned {resp.status_code}"
            )
        data = resp.json()
    ttl = int(data.get("expires_in", 3600))
    return data["access_token"], time.time() + ttl


async def get_service_token(force_refresh: bool = False) -> str:
    """Return a valid admin service JWT for s2s calls. Refreshes when within
    `service_token_refresh_margin_seconds` of expiry."""
    global _cached_token, _cached_expires_at
    s = get_settings()
    now = time.time()
    if (
        not force_refresh
        and _cached_token
        and now < _cached_expires_at - s.service_token_refresh_margin_seconds
    ):
        return _cached_token
    async with _lock:
        # Double-check under the lock — another coroutine may have refreshed.
        if (
            not force_refresh
            and _cached_token
            and time.time() < _cached_expires_at - s.service_token_refresh_margin_seconds
        ):
            return _cached_token
        _cached_token, _cached_expires_at = await _mint(tenant_id=None)
        logger.info("service_token.refreshed")
        return _cached_token


async def get_service_token_for_tenant(tenant_id: str) -> str:
    """Return a service JWT whose ``tenant_id`` claim is ``tenant_id``.

    Used for calls into services that scope their writes by the *token's*
    tenant rather than a request-body field (submission's bulk author-id
    reconciliation). Cached per tenant; refreshed before expiry.
    """
    s = get_settings()
    now = time.time()
    cached = _tenant_tokens.get(tenant_id)
    if cached and now < cached[1] - s.service_token_refresh_margin_seconds:
        return cached[0]
    async with _tenant_lock:
        cached = _tenant_tokens.get(tenant_id)
        if cached and time.time() < cached[1] - s.service_token_refresh_margin_seconds:
            return cached[0]
        token, expires_at = await _mint(tenant_id=tenant_id)
        _tenant_tokens[tenant_id] = (token, expires_at)
        logger.info("service_token.tenant_refreshed", tenant_id=tenant_id)
        return token


async def auth_headers() -> dict[str, str]:
    """Convenience wrapper for httpx requests."""
    token = await get_service_token()
    return {"Authorization": f"Bearer {token}"}


async def auth_headers_for_tenant(tenant_id: str) -> dict[str, str]:
    """``auth_headers`` variant carrying a tenant-scoped token."""
    token = await get_service_token_for_tenant(tenant_id)
    return {"Authorization": f"Bearer {token}"}
