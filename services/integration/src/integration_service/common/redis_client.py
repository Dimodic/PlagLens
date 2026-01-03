"""Async Redis client (singleton)."""
from __future__ import annotations

from typing import Optional

import redis.asyncio as aioredis

from integration_service.config import get_settings

_client: Optional[aioredis.Redis] = None


def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        s = get_settings()
        _client = aioredis.from_url(s.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
        _client = None


async def set_redis_for_tests(client: aioredis.Redis) -> None:
    global _client
    _client = client
