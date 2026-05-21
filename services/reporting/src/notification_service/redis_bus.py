"""Redis async client + pub/sub helpers with in-memory fallback."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any, Protocol

from notification_service.config import get_settings


class _PubSubLike(Protocol):
    async def subscribe(self, *channels: str) -> None: ...
    async def unsubscribe(self, *channels: str) -> None: ...
    async def get_message(self, ignore_subscribe_messages: bool = ..., timeout: float = ...) -> Any: ...
    async def close(self) -> None: ...


class _InMemoryPubSub:
    def __init__(self, bus: InMemoryRedis) -> None:
        self._bus = bus
        self._channels: set[str] = set()
        self._queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def subscribe(self, *channels: str) -> None:
        for ch in channels:
            self._channels.add(ch)
            self._bus._subscribe(ch, self._queue)

    async def unsubscribe(self, *channels: str) -> None:
        for ch in channels:
            self._channels.discard(ch)
            self._bus._unsubscribe(ch, self._queue)

    async def get_message(
        self, ignore_subscribe_messages: bool = True, timeout: float = 1.0
    ) -> dict[str, Any] | None:
        try:
            msg = await asyncio.wait_for(self._queue.get(), timeout=timeout)
            return msg
        except TimeoutError:
            return None

    async def close(self) -> None:
        for ch in list(self._channels):
            self._bus._unsubscribe(ch, self._queue)
        self._channels.clear()


class InMemoryRedis:
    def __init__(self) -> None:
        self._subs: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}
        self._kv: dict[str, str] = {}
        self._sets: dict[str, set[str]] = {}
        self._zsets: dict[str, dict[str, float]] = {}

    def _subscribe(self, channel: str, q: asyncio.Queue[dict[str, Any]]) -> None:
        self._subs.setdefault(channel, []).append(q)

    def _unsubscribe(self, channel: str, q: asyncio.Queue[dict[str, Any]]) -> None:
        if channel in self._subs:
            try:
                self._subs[channel].remove(q)
            except ValueError:
                pass

    async def publish(self, channel: str, message: str) -> int:
        listeners = list(self._subs.get(channel, []))
        for q in listeners:
            await q.put({"type": "message", "channel": channel, "data": message})
        return len(listeners)

    def pubsub(self, ignore_subscribe_messages: bool = True) -> _InMemoryPubSub:
        return _InMemoryPubSub(self)

    async def get(self, key: str) -> str | None:
        return self._kv.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self._kv[key] = value
        return True

    async def setex(self, key: str, ttl: int, value: str) -> bool:
        self._kv[key] = value
        return True

    async def delete(self, *keys: str) -> int:
        n = 0
        for k in keys:
            if k in self._kv:
                del self._kv[k]
                n += 1
        return n

    async def incr(self, key: str) -> int:
        v = int(self._kv.get(key, "0")) + 1
        self._kv[key] = str(v)
        return v

    async def expire(self, key: str, ttl: int) -> bool:
        return key in self._kv

    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        z = self._zsets.setdefault(key, {})
        added = 0
        for m, s in mapping.items():
            if m not in z:
                added += 1
            z[m] = s
        return added

    async def zrangebyscore(self, key: str, min_: float, max_: float) -> list[str]:
        z = self._zsets.get(key, {})
        return [m for m, s in z.items() if min_ <= s <= max_]

    async def zrem(self, key: str, *members: str) -> int:
        z = self._zsets.get(key, {})
        n = 0
        for m in members:
            if m in z:
                del z[m]
                n += 1
        return n

    async def aclose(self) -> None:  # redis-py 5.x naming
        return None

    async def close(self) -> None:
        return None


_client: Any | None = None


def init_redis(client: Any | None = None) -> Any:
    global _client
    settings = get_settings()
    if client is not None:
        _client = client
        return _client
    if settings.REDIS_DISABLED:
        _client = InMemoryRedis()
        return _client
    try:
        import redis.asyncio as aioredis  # type: ignore[import-not-found]

        _client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        _client = InMemoryRedis()
    return _client


def get_redis() -> Any:
    if _client is None:
        return init_redis()
    return _client


def set_redis_client(client: Any) -> None:
    global _client
    _client = client


async def close_redis() -> None:
    global _client
    if _client is None:
        return
    try:
        if hasattr(_client, "aclose"):
            await _client.aclose()
        elif hasattr(_client, "close"):
            await _client.close()
    finally:
        _client = None


def sse_channel(user_id: str) -> str:
    return f"{get_settings().SSE_REDIS_CHANNEL_PREFIX}{user_id}"


async def publish_sse(user_id: str, payload: str) -> int:
    client = get_redis()
    return await client.publish(sse_channel(user_id), payload)


async def iter_pubsub_messages(
    channel: str, *, timeout: float = 1.0
) -> AsyncIterator[dict[str, Any]]:
    client = get_redis()
    pubsub = client.pubsub(ignore_subscribe_messages=True)
    await pubsub.subscribe(channel)
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=timeout)
            if msg:
                yield msg
            else:
                yield {"type": "_idle"}
    finally:
        await pubsub.close()
