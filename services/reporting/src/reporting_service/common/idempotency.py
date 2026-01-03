"""Idempotency-Key handling backed by Redis."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from .problem import conflict


def hash_body(body: dict[str, Any]) -> str:
    raw = json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


@dataclass
class IdempotencyResult:
    cached: bool
    body: dict[str, Any] | None


class IdempotencyStore:
    """Stores `(idempotency_key, body_hash) -> response` for 24h.

    The store accepts an async Redis client implementing ``set/get`` with the
    same call surface as redis-py async. ``fakeredis.aioredis.FakeRedis`` works.
    """

    def __init__(self, redis, namespace: str = "reporting:idem", ttl_seconds: int = 86400):
        self.redis = redis
        self.namespace = namespace
        self.ttl = ttl_seconds

    def _key(self, tenant_id: str, key: str) -> str:
        return f"{self.namespace}:{tenant_id}:{key}"

    async def lookup_or_record(
        self,
        tenant_id: str,
        key: str | None,
        body: dict[str, Any],
    ) -> IdempotencyResult:
        if not key:
            return IdempotencyResult(cached=False, body=None)
        body_hash = hash_body(body)
        rkey = self._key(tenant_id, key)
        existing_raw = await self.redis.get(rkey)
        if existing_raw:
            existing = json.loads(existing_raw if isinstance(existing_raw, str) else existing_raw.decode())
            if existing.get("hash") != body_hash:
                raise conflict(
                    "IDEMPOTENCY_KEY_CONFLICT",
                    "Same Idempotency-Key was used with a different body",
                )
            cached_body = existing.get("response")
            if cached_body is not None:
                return IdempotencyResult(cached=True, body=cached_body)
        # mark in-flight (no response yet)
        await self.redis.set(
            rkey,
            json.dumps({"hash": body_hash, "response": None}),
            ex=self.ttl,
        )
        return IdempotencyResult(cached=False, body=None)

    async def store_response(
        self,
        tenant_id: str,
        key: str | None,
        body: dict[str, Any],
        response: dict[str, Any],
    ) -> None:
        if not key:
            return
        rkey = self._key(tenant_id, key)
        await self.redis.set(
            rkey,
            json.dumps({"hash": hash_body(body), "response": response}),
            ex=self.ttl,
        )
