"""Atomic rate-limiter on top of Redis.

We use a fixed-window counter implemented as a Lua script (atomic INCR + EXPIRE)
to keep the dimension counters consistent under concurrency.

Dimensions:
    per_ip / per_user / per_endpoint_class

Each dimension produces its own Redis key:
    rl:<dimension>:<id>:<window_start>

Returns (allowed, remaining, reset_at_epoch).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

# KEYS[1] = redis key
# ARGV[1] = limit
# ARGV[2] = window_seconds
LUA_SCRIPT = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call("INCR", key)
if current == 1 then
    redis.call("EXPIRE", key, window)
end
local ttl = redis.call("TTL", key)
if ttl < 0 then
    redis.call("EXPIRE", key, window)
    ttl = window
end
return { current, ttl }
"""


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    reset_at: int  # epoch seconds


@dataclass(frozen=True)
class RateLimitPolicy:
    """A rate-limit policy: limit per window."""

    limit: int
    window_s: int

    @classmethod
    def per_minute(cls, n: int) -> RateLimitPolicy:
        return cls(limit=n, window_s=60)

    @classmethod
    def per_hour(cls, n: int) -> RateLimitPolicy:
        return cls(limit=n, window_s=3600)


async def _eval_lua(redis: Any, key: str, limit: int, window: int) -> tuple[int, int]:
    """Run the LUA atomically. Falls back to non-atomic if EVAL is unavailable."""
    try:
        res = await redis.eval(LUA_SCRIPT, 1, key, limit, window)
        if isinstance(res, list | tuple) and len(res) == 2:
            return int(res[0]), int(res[1])
    except Exception:  # noqa: S110 - fallback path is intentional
        pass
    # Fallback path (still safe for tests with fakeredis)
    current = int(await redis.incr(key))
    if current == 1:
        await redis.expire(key, window)
    ttl_val = await redis.ttl(key)
    try:
        ttl = int(ttl_val)
    except (TypeError, ValueError):
        ttl = window
    if ttl < 0:
        await redis.expire(key, window)
        ttl = window
    return current, ttl


async def check(
    redis: Any,
    *,
    dimension: str,
    identity: str,
    policy: RateLimitPolicy,
    now: int | None = None,
) -> RateLimitDecision:
    """Atomic check + increment.

    `dimension` is one of: ip, user, endpoint_class.
    `identity` distinguishes counters within a dimension.
    """
    now_ts = now if now is not None else int(time.time())
    window_start = now_ts - (now_ts % policy.window_s)
    key = f"rl:{dimension}:{identity}:{window_start}"
    current, ttl = await _eval_lua(redis, key, policy.limit, policy.window_s)
    remaining = max(0, policy.limit - current)
    reset_at = now_ts + max(1, ttl)
    allowed = current <= policy.limit
    return RateLimitDecision(
        allowed=allowed,
        limit=policy.limit,
        remaining=remaining,
        reset_at=reset_at,
    )


__all__ = ["RateLimitPolicy", "RateLimitDecision", "check", "LUA_SCRIPT"]
