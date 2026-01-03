"""Idempotency-Key middleware (Redis-backed with in-process fallback)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from .problem import problem_response

logger = structlog.get_logger(__name__)

_IDEMPOTENT_METHODS = {"POST"}
_TTL_SECONDS = 24 * 60 * 60


class _MemoryStore:
    """Simple in-process fallback for tests; not safe across workers."""

    def __init__(self) -> None:
        self._data: dict[str, dict[str, Any]] = {}

    async def get(self, key: str) -> dict[str, Any] | None:
        return self._data.get(key)

    async def set(self, key: str, value: dict[str, Any]) -> None:
        self._data[key] = value


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """Stores ``(key, body_hash) -> cached response`` for 24h.

    On replay with same body returns the cached response; on conflict (same key,
    different body) returns 409 IDEMPOTENCY_KEY_CONFLICT.
    """

    def __init__(self, app, redis_client: Any | None = None) -> None:
        super().__init__(app)
        self._redis = redis_client
        self._memory = _MemoryStore()

    async def _get(self, key: str) -> dict[str, Any] | None:
        if self._redis is not None:
            try:
                raw = await self._redis.get(key)
                return json.loads(raw) if raw else None
            except Exception:
                logger.warning("idempotency.redis_get_failed", key=key)
        return await self._memory.get(key)

    async def _set(self, key: str, value: dict[str, Any]) -> None:
        if self._redis is not None:
            try:
                await self._redis.set(key, json.dumps(value), ex=_TTL_SECONDS)
                return
            except Exception:
                logger.warning("idempotency.redis_set_failed", key=key)
        await self._memory.set(key, value)

    async def dispatch(self, request: Request, call_next):
        if request.method not in _IDEMPOTENT_METHODS:
            return await call_next(request)
        idem_key = request.headers.get("Idempotency-Key")
        if not idem_key:
            return await call_next(request)

        # Lazily pick up Redis from app.state if it was initialised in lifespan.
        if self._redis is None:
            self._redis = getattr(request.app.state, "redis", None)

        body = await request.body()

        async def _replay_receive():
            return {"type": "http.request", "body": body, "more_body": False}

        request._receive = _replay_receive  # type: ignore[attr-defined]

        body_hash = hashlib.sha256(body).hexdigest()
        cache_key = f"idem:{idem_key}"
        cached = await self._get(cache_key)
        if cached is not None:
            if cached.get("body_hash") != body_hash:
                return problem_response(
                    status=409,
                    code="IDEMPOTENCY_KEY_CONFLICT",
                    detail="Idempotency-Key reused with a different request body",
                    request_id=request.headers.get("X-Request-Id"),
                )
            return Response(
                content=cached["body"].encode("utf-8"),
                status_code=cached["status"],
                headers=cached["headers"],
            )

        response = await call_next(request)
        if 200 <= response.status_code < 300 and response.status_code != 204:
            chunks: list[bytes] = []
            async for chunk in response.body_iterator:
                chunks.append(chunk)
            full_body = b"".join(chunks)
            headers = {
                k: v
                for k, v in response.headers.items()
                if k.lower() not in {"content-length", "transfer-encoding"}
            }
            await self._set(
                cache_key,
                {
                    "body_hash": body_hash,
                    "body": full_body.decode("utf-8", errors="replace"),
                    "status": response.status_code,
                    "headers": headers,
                },
            )
            return Response(
                content=full_body,
                status_code=response.status_code,
                headers=headers,
                media_type=response.media_type,
            )
        return response
