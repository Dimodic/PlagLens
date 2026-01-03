"""Idempotency-Key middleware: replay cached response for repeat (key, body-hash)."""
from __future__ import annotations

import hashlib
from typing import Awaitable, Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """Looks up Idempotency-Key in Redis; replays cached body for matching hash.

    ``app.state.redis`` must expose async ``get`` and ``set``. If absent or
    unreachable the middleware is a passthrough (logs an event).
    """

    HEADER = "Idempotency-Key"
    METHODS = {"POST"}

    def __init__(self, app, ttl_seconds: int = 24 * 3600) -> None:
        super().__init__(app)
        self.ttl = ttl_seconds

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method not in self.METHODS:
            return await call_next(request)
        key = request.headers.get(self.HEADER)
        if not key:
            return await call_next(request)

        redis = getattr(request.app.state, "redis", None)
        body = await request.body()
        body_hash = hashlib.sha256(body).hexdigest()
        cache_key = f"idem:{key}"

        if redis is not None:
            try:
                cached = await redis.get(cache_key)
            except Exception:
                cached = None
            if cached:
                try:
                    cached_hash, status, payload = cached.split("|", 2)
                except ValueError:
                    cached_hash, status, payload = "", "200", cached
                if cached_hash and cached_hash != body_hash:
                    from .problem import problem_response

                    return problem_response(
                        request,
                        status=409,
                        code="IDEMPOTENCY_KEY_CONFLICT",
                        title="Idempotency-Key conflict",
                        detail="The same key was used with a different request body.",
                    )
                return Response(
                    content=payload,
                    status_code=int(status),
                    media_type="application/json",
                    headers={"X-Idempotent-Replay": "true"},
                )

        response = await call_next(request)
        if redis is not None and 200 <= response.status_code < 500:
            try:
                if isinstance(response, JSONResponse):
                    payload = response.body.decode("utf-8")
                else:
                    payload = ""
                await redis.set(
                    cache_key,
                    f"{body_hash}|{response.status_code}|{payload}",
                    ex=self.ttl,
                )
            except Exception:
                # Best-effort cache; never fail the request because of idempotency layer.
                pass
        return response
