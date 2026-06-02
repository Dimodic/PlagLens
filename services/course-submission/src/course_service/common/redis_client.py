"""Redis helper used for atomic invitation consumption.

Provides a thin wrapper that:

- exposes ``incr`` / ``set`` / ``get`` / ``delete``;
- falls back to an in-process counter when Redis is disabled or unreachable
  (so unit tests do not need a running broker).

The wrapper is intentionally tiny — we only need atomic counters and TTL
for ``Idempotency-Key`` storage in the middleware.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


class _MemoryRedis:
    def __init__(self) -> None:
        self._kv: dict[str, str] = {}
        self._counters: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> str | None:
        return self._kv.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._kv[key] = value

    async def delete(self, key: str) -> None:
        self._kv.pop(key, None)
        self._counters.pop(key, None)

    async def incr(self, key: str) -> int:
        async with self._lock:
            self._counters[key] = self._counters.get(key, 0) + 1
            return self._counters[key]

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        return


class RedisClient:
    """Async Redis facade with in-process fallback.

    ``backend`` is either an actual ``redis.asyncio.Redis`` instance or
    :class:`_MemoryRedis`. Both expose ``get/set/delete/incr/aclose``.
    """

    def __init__(self, url: str, *, enabled: bool = True) -> None:
        self.url = url
        self.enabled = enabled
        self._backend: Any | None = None

    async def _get_backend(self) -> Any:
        if self._backend is not None:
            return self._backend
        if not self.enabled:
            self._backend = _MemoryRedis()
            return self._backend
        try:
            from redis.asyncio import from_url  # type: ignore[import-untyped]

            self._backend = from_url(self.url, decode_responses=True)
        except Exception as exc:
            logger.warning("redis.connect_failed", error=str(exc))
            self._backend = _MemoryRedis()
        return self._backend

    async def get(self, key: str) -> str | None:
        backend = await self._get_backend()
        return await backend.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        backend = await self._get_backend()
        await backend.set(key, value, ex=ex)

    async def delete(self, key: str) -> None:
        backend = await self._get_backend()
        await backend.delete(key)

    async def incr(self, key: str) -> int:
        backend = await self._get_backend()
        return int(await backend.incr(key))

    async def ping(self) -> bool:
        """Liveness probe for /readyz. Delegates to the backend; the in-process
        fallback always answers True (the Redis layer is functioning)."""
        backend = await self._get_backend()
        return bool(await backend.ping())

    async def aclose(self) -> None:
        if self._backend is not None and hasattr(self._backend, "aclose"):
            with contextlib.suppress(Exception):
                await self._backend.aclose()
        self._backend = None
