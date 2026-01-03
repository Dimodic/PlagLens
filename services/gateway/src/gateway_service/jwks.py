"""JWKS client with Redis-backed cache + graceful refresh.

JWKS is cached in Redis at key `gw:jwks:doc` for 1h with a sliding refresh:
when expired, gateway fetches the new JWKS from Identity Service
(via httpx) but, on failure, **keeps serving the stale doc** until next
attempt.
"""

from __future__ import annotations

import json
import time
from typing import Any

import httpx

from gateway_service.config import settings
from gateway_service.logging import get_logger
from gateway_service.redis_client import get_redis

log = get_logger(__name__)

_JWKS_KEY = "gw:jwks:doc"
_JWKS_TS_KEY = "gw:jwks:fetched_at"
_LOCK_KEY = "gw:jwks:lock"


class JWKSCache:
    """Process-local mirror to avoid hitting Redis on every request."""

    def __init__(self) -> None:
        self._doc: dict[str, Any] | None = None
        self._fetched_at: float = 0.0

    def is_fresh(self) -> bool:
        return self._doc is not None and (time.time() - self._fetched_at) < settings.jwks_cache_ttl_s

    def set(self, doc: dict[str, Any], fetched_at: float | None = None) -> None:
        self._doc = doc
        self._fetched_at = fetched_at or time.time()

    def get(self) -> dict[str, Any] | None:
        return self._doc


jwks_cache = JWKSCache()


async def fetch_jwks_remote(client: httpx.AsyncClient | None = None) -> dict[str, Any]:
    own_client = client is None
    c = client or httpx.AsyncClient(timeout=settings.proxy_connect_timeout_s)
    try:
        resp = await c.get(settings.jwks_url)
        resp.raise_for_status()
        return resp.json()
    finally:
        if own_client:
            await c.aclose()


async def _read_redis_jwks() -> dict[str, Any] | None:
    try:
        r = await get_redis()
        raw = await r.get(_JWKS_KEY)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:  # pragma: no cover - redis optional in tests
        log.warning("jwks_redis_read_failed", error=str(e))
        return None


async def _write_redis_jwks(doc: dict[str, Any]) -> None:
    try:
        r = await get_redis()
        await r.set(_JWKS_KEY, json.dumps(doc), ex=settings.jwks_cache_ttl_s)
        await r.set(_JWKS_TS_KEY, str(time.time()), ex=settings.jwks_cache_ttl_s)
    except Exception as e:  # pragma: no cover
        log.warning("jwks_redis_write_failed", error=str(e))


async def get_jwks(force_refresh: bool = False) -> dict[str, Any]:
    """Return JWKS document, fetching/refreshing as needed.

    Strategy:
    1. Process-local cache hit (TTL 1h) → return.
    2. Redis cache hit → adopt + return.
    3. Otherwise, fetch from Identity. On failure, return stale if any.
    """
    if not force_refresh and jwks_cache.is_fresh():
        return jwks_cache.get()  # type: ignore[return-value]

    # Try Redis (shared across replicas)
    redis_doc = await _read_redis_jwks()
    if redis_doc is not None and not force_refresh:
        jwks_cache.set(redis_doc)
        return redis_doc

    # Refresh from Identity
    try:
        doc = await fetch_jwks_remote()
        jwks_cache.set(doc)
        await _write_redis_jwks(doc)
        return doc
    except Exception as e:
        log.warning("jwks_fetch_failed", error=str(e))
        # graceful: keep serving stale
        if jwks_cache.get() is not None:
            return jwks_cache.get()  # type: ignore[return-value]
        if redis_doc is not None:
            jwks_cache.set(redis_doc)
            return redis_doc
        raise


__all__ = ["get_jwks", "fetch_jwks_remote", "JWKSCache", "jwks_cache"]
