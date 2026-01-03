"""Async Redis client wrapper with lazy init."""

from __future__ import annotations

from typing import Any

try:
    import redis.asyncio as aioredis
except Exception:  # pragma: no cover
    aioredis = None  # type: ignore[assignment]

from gateway_service.config import settings


class RedisHolder:
    def __init__(self) -> None:
        self._client: Any | None = None

    async def get(self) -> Any:
        if self._client is None:
            if aioredis is None:  # pragma: no cover
                raise RuntimeError("redis-py is not installed")
            self._client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:  # pragma: no cover  # noqa: S110
                pass
            self._client = None

    def set_client(self, client: Any) -> None:
        """Used by tests to inject fakeredis."""
        self._client = client


redis_holder = RedisHolder()


async def get_redis() -> Any:
    return await redis_holder.get()


__all__ = ["redis_holder", "get_redis", "RedisHolder"]
