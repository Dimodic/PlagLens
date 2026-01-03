"""Redis-backed analysis cache.

Key format: ``{prefix}:{tenant}:cache:ai:{cache_key}`` where ``cache_key``
is ``sha256(model + prompt_version + code_hash + language)``. Hits return a
serialized ``AnalysisResult`` (without the live LLM call).
"""
from __future__ import annotations

import hashlib
import json
import logging
from decimal import Decimal
from typing import Any

from ..config import get_settings
from ..providers.base import AnalysisResult, TokenUsage
from ..schemas import PlagLensReport

logger = logging.getLogger(__name__)


def code_hash(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def build_cache_key(
    *, model: str, prompt_version: str, code: str, language: str
) -> str:
    h = hashlib.sha256()
    h.update(model.encode())
    h.update(b"|")
    h.update(prompt_version.encode())
    h.update(b"|")
    h.update(code_hash(code).encode())
    h.update(b"|")
    h.update(language.encode())
    return h.hexdigest()


class AnalysisCache:
    def __init__(self, redis_client: Any | None) -> None:
        self._redis = redis_client
        s = get_settings()
        self._prefix = s.REDIS_KEY_PREFIX
        self._ttl = s.CACHE_TTL_SECONDS
        # In-memory fallback for tests where redis is None.
        self._local: dict[str, str] = {}

    def _key(self, tenant_id: str, cache_key: str) -> str:
        return f"{self._prefix}:{tenant_id}:cache:ai:{cache_key}"

    async def get(self, tenant_id: str, cache_key: str) -> AnalysisResult | None:
        full = self._key(tenant_id, cache_key)
        raw: str | None = None
        if self._redis is not None:
            raw = await self._redis.get(full)
            if raw is not None:
                # Refresh TTL on hit.
                try:
                    await self._redis.expire(full, self._ttl)
                except Exception:  # noqa: BLE001
                    logger.debug("redis expire failed for key=%s", full, exc_info=True)
        else:
            raw = self._local.get(full)
        if not raw:
            return None
        try:
            doc = json.loads(raw)
        except Exception:
            return None
        return _from_doc(doc)

    async def set(self, tenant_id: str, cache_key: str, result: AnalysisResult) -> None:
        full = self._key(tenant_id, cache_key)
        doc = _to_doc(result)
        payload = json.dumps(doc, default=str)
        if self._redis is not None:
            await self._redis.set(full, payload, ex=self._ttl)
        else:
            self._local[full] = payload

    async def delete_by_prefix(self, pattern: str) -> int:
        if self._redis is None:
            keys = [k for k in self._local if pattern.replace("*", "") in k]
            for k in keys:
                self._local.pop(k, None)
            return len(keys)
        deleted = 0
        try:
            cursor = 0
            while True:
                cursor, keys = await self._redis.scan(cursor=cursor, match=pattern, count=200)
                if keys:
                    deleted += await self._redis.delete(*keys)
                if cursor == 0:
                    break
        except Exception:
            return deleted
        return deleted

    async def stats(self, tenant_id: str) -> tuple[int, int]:
        """Return (key_count, approx_size_bytes) for tenant."""
        pattern = f"{self._prefix}:{tenant_id}:cache:ai:*"
        if self._redis is None:
            count = sum(1 for k in self._local if k.startswith(f"{self._prefix}:{tenant_id}:cache:ai:"))
            size = sum(len(v) for k, v in self._local.items() if k.startswith(f"{self._prefix}:{tenant_id}:cache:ai:"))
            return count, size
        count = 0
        size = 0
        try:
            cursor = 0
            while True:
                cursor, keys = await self._redis.scan(cursor=cursor, match=pattern, count=200)
                count += len(keys)
                for k in keys:
                    val = await self._redis.get(k)
                    if val is not None:
                        size += len(val)
                if cursor == 0:
                    break
        except Exception:  # noqa: BLE001
            logger.debug("redis scan failed", exc_info=True)
        return count, size


def _to_doc(r: AnalysisResult) -> dict[str, Any]:
    return {
        "report": r.report.model_dump(),
        "raw_text": r.raw_text,
        "usage": {
            "prompt_tokens": r.tokens_used.prompt_tokens,
            "completion_tokens": r.tokens_used.completion_tokens,
            "total_tokens": r.tokens_used.total_tokens,
        },
        "cost_estimate": str(r.cost_estimate),
        "currency": r.currency,
        "provider": r.provider,
        "model": r.model,
        "prompt_version": r.prompt_version,
        "latency_ms": r.latency_ms,
    }


def _from_doc(doc: dict[str, Any]) -> AnalysisResult:
    return AnalysisResult(
        report=PlagLensReport.model_validate(doc["report"]),
        raw_text=str(doc.get("raw_text", "")),
        tokens_used=TokenUsage(
            prompt_tokens=int(doc["usage"]["prompt_tokens"]),
            completion_tokens=int(doc["usage"]["completion_tokens"]),
            total_tokens=int(doc["usage"]["total_tokens"]),
        ),
        cost_estimate=Decimal(str(doc.get("cost_estimate", "0"))),
        cached=True,
        provider=str(doc.get("provider", "")),
        model=str(doc.get("model", "")),
        prompt_version=str(doc.get("prompt_version", "")),
        latency_ms=int(doc.get("latency_ms", 0)),
        currency=str(doc.get("currency", "USD")),
    )
