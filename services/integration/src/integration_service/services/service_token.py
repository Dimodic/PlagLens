"""Cached super_admin token issued by identity-service.

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
SERVICE_NAME = "integration-service"


async def get_service_token(force_refresh: bool = False) -> str:
    """Return a valid super_admin JWT for s2s calls. Refreshes when within
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
        url = (
            s.identity_service_url.rstrip("/")
            + "/api/v1/auth/service-token"
        )
        async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
            resp = await client.post(
                url,
                headers={"X-Service-Secret": s.service_auth_secret},
                json={"service_name": SERVICE_NAME},
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
        _cached_token = data["access_token"]
        ttl = int(data.get("expires_in", 3600))
        _cached_expires_at = time.time() + ttl
        logger.info("service_token.refreshed", ttl=ttl)
        return _cached_token


async def auth_headers() -> dict[str, str]:
    """Convenience wrapper for httpx requests."""
    token = await get_service_token()
    return {"Authorization": f"Bearer {token}"}
