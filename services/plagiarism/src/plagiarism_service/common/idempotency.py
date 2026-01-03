"""Idempotency-Key handling (cross-cutting §6) backed by Redis with in-memory fallback."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from ..config import get_settings


class IdempotencyStore:
    def __init__(self, redis_client: Any | None = None) -> None:
        self._redis = redis_client
        self._local: dict[str, tuple[str, dict[str, Any]]] = {}
        self._ttl = get_settings().redis_idempotency_ttl_seconds

    @staticmethod
    def hash_body(body: bytes | str | dict[str, Any]) -> str:
        if isinstance(body, dict):
            payload = json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
        elif isinstance(body, str):
            payload = body.encode()
        else:
            payload = body
        return hashlib.sha256(payload).hexdigest()

    async def get(self, key: str) -> tuple[str, dict[str, Any]] | None:
        if self._redis is None:
            return self._local.get(key)
        raw = await self._redis.get(f"idem:{key}")
        if raw is None:
            return None
        try:
            doc = json.loads(raw)
            return doc["hash"], doc["response"]
        except Exception:
            return None

    async def set(self, key: str, body_hash: str, response: dict[str, Any]) -> None:
        doc = {"hash": body_hash, "response": response}
        if self._redis is None:
            self._local[key] = (body_hash, response)
            return
        await self._redis.set(
            f"idem:{key}",
            json.dumps(doc, default=str),
            ex=self._ttl,
        )
