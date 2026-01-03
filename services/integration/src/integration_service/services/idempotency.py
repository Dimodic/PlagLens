"""Idempotency-Key support backed by Redis."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from integration_service.common.redis_client import get_redis

IDEMPOTENCY_TTL_SECONDS = 24 * 3600


def _redis_key(tenant_id: str, key: str) -> str:
    return f"{tenant_id}:idempotency:{key}"


def _hash_body(body: Any) -> str:
    payload = json.dumps(body, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def get_cached_response(
    tenant_id: str, key: str, body: Any
) -> tuple[Optional[dict[str, Any]], bool]:
    """Return ``(cached, conflict)``.

    * ``cached`` — previously stored response body if any.
    * ``conflict`` — ``True`` if the same key was used with a *different* body
      (caller should answer 409 ``IDEMPOTENCY_KEY_CONFLICT``).
    """
    if not key:
        return None, False
    redis = get_redis()
    raw = await redis.get(_redis_key(tenant_id, key))
    if not raw:
        return None, False
    try:
        record = json.loads(raw)
    except Exception:
        return None, False
    if record.get("body_hash") != _hash_body(body):
        return None, True
    return record.get("response"), False


async def store_response(
    tenant_id: str,
    key: str,
    body: Any,
    response: dict[str, Any],
    ttl: int = IDEMPOTENCY_TTL_SECONDS,
) -> None:
    if not key:
        return
    redis = get_redis()
    record = {"body_hash": _hash_body(body), "response": response}
    await redis.set(_redis_key(tenant_id, key), json.dumps(record), ex=ttl)
