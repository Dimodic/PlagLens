"""Tiny redis-backed JSON cache for dashboards."""
from __future__ import annotations

import json
from typing import Any


class JsonCache:
    def __init__(self, redis, prefix: str):
        self.redis = redis
        self.prefix = prefix

    def _k(self, key: str) -> str:
        return f"{self.prefix}:{key}"

    async def get(self, key: str) -> Any | None:
        raw = await self.redis.get(self._k(key))
        if raw is None:
            return None
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode()
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def set(self, key: str, value: Any, ttl: int) -> None:
        await self.redis.set(self._k(key), json.dumps(value, default=str), ex=ttl)

    async def invalidate(self, key: str) -> None:
        await self.redis.delete(self._k(key))
