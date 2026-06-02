"""Async Redis client factory (single shared instance).

The plagiarism service does not hold a long-lived Redis connection for normal
request handling (the Idempotency-Key contract uses an in-memory fallback when
Redis is absent). This module exposes the one shared async client so that
readiness probes — and any future Redis-backed feature — talk to the same
connection that ``REDIS_URL`` points at.
"""
from __future__ import annotations

from typing import Any

from ..config import get_settings

_client: Any | None = None


def set_client(client: Any | None) -> None:
    """Inject a client (tests pass fakeredis here)."""
    global _client
    _client = client


def reset_client() -> None:
    global _client
    _client = None


def get_client() -> Any:
    """Return the shared async Redis client, building it lazily from settings.

    Never raises: if the ``redis`` package or the URL is unusable the function
    returns ``None`` so callers (e.g. the readiness probe) can degrade
    gracefully rather than crash.
    """
    global _client
    if _client is None:
        try:
            import redis.asyncio as redis_async

            _client = redis_async.from_url(
                get_settings().redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        except Exception:  # pragma: no cover - redis is optional at import time
            _client = None
    return _client
