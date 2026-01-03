"""Redis async client factory (single shared instance)."""
from __future__ import annotations

from typing import Any

from ..config import get_settings

_client: Any | None = None


def set_client(client: Any | None) -> None:
    """Tests inject fakeredis here."""
    global _client
    _client = client


def reset_client() -> None:
    global _client
    _client = None


def get_client() -> Any:
    global _client
    if _client is None:
        try:
            import redis.asyncio as redis_async

            settings = get_settings()
            _client = redis_async.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
        except Exception:
            _client = None
    return _client
