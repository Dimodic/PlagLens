"""ASGI middleware implementing the Idempotency-Key contract.

See `docs/architecture/01-CROSS-CUTTING.md` §6.

Behavior
--------
- Only POST requests with an `Idempotency-Key` header are intercepted.
- Cached entry layout in Redis::

      key = f"{prefix}{tenant_or_global}:{idempotency_key}"
      value = JSON({"body_hash": ..., "status": ..., "headers": [...], "body_b64": ...})

- Same key + same body  -> cached response is replayed.
- Same key + different body -> 409 IDEMPOTENCY_KEY_CONFLICT (problem+json).

The middleware buffers the upstream response body so that the cache can be
populated. Streaming responses are cached only if they fit within `max_body_bytes`.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from typing import Any, Protocol

from .errors import IdempotencyKeyConflictError
from .headers import CONTENT_TYPE_PROBLEM, IDEMPOTENCY_KEY, REQUEST_ID

logger = logging.getLogger(__name__)

DEFAULT_TTL_SECONDS: int = 24 * 3600  # 24h per spec
DEFAULT_PREFIX: str = "plaglens:idem:"
DEFAULT_MAX_BODY_BYTES: int = 2 * 1024 * 1024  # 2 MiB


class _AsyncRedisLike(Protocol):
    async def get(self, key: str) -> Any: ...
    async def set(self, key: str, value: Any, ex: int | None = None, nx: bool = False) -> Any: ...


def _hash_body(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _build_cache_key(prefix: str, tenant_id: str | None, key: str) -> str:
    return f"{prefix}{tenant_id or 'global'}:{key}"


class IdempotencyMiddleware:
    """ASGI middleware. Wrap your FastAPI app::

        app.add_middleware(IdempotencyMiddleware, redis=redis_client)
    """

    def __init__(
        self,
        app: Any,
        redis: _AsyncRedisLike,
        *,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        prefix: str = DEFAULT_PREFIX,
        max_body_bytes: int = DEFAULT_MAX_BODY_BYTES,
    ) -> None:
        self.app = app
        self.redis = redis
        self.ttl = ttl_seconds
        self.prefix = prefix
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        if (scope.get("method") or "").upper() != "POST":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        idem_key = headers.get(IDEMPOTENCY_KEY.lower())
        if not idem_key:
            await self.app(scope, receive, send)
            return

        # Read the request body fully (we need its hash).
        body = bytearray()
        more = True
        cached_messages: list[dict[str, Any]] = []
        while more:
            message = await receive()
            cached_messages.append(message)
            if message["type"] == "http.request":
                body.extend(message.get("body", b""))
                more = message.get("more_body", False)
            else:  # disconnect
                more = False

        body_bytes = bytes(body)
        body_hash = _hash_body(body_bytes)
        tenant_id = headers.get("x-tenant-hint") or headers.get("x-tenant-id")
        cache_key = _build_cache_key(self.prefix, tenant_id, idem_key)

        # Cache lookup
        cached_raw: Any = None
        try:
            cached_raw = await self.redis.get(cache_key)
        except Exception:  # pragma: no cover - redis is optional
            logger.warning("Redis idempotency lookup failed", exc_info=True)

        if cached_raw is not None:
            entry = _decode_cached(cached_raw)
            if entry is not None:
                if entry.get("body_hash") != body_hash:
                    await _send_conflict(send, headers.get(REQUEST_ID.lower()))
                    return
                await _replay(entry, send)
                return

        # Miss: replay request body to downstream and capture response
        replayed = False

        async def _new_receive() -> dict[str, Any]:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            return await receive()

        captured: dict[str, Any] = {"status": 0, "headers": [], "body": bytearray(), "too_large": False}

        async def _new_send(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                captured["status"] = int(message.get("status", 0))
                captured["headers"] = list(message.get("headers") or [])
            elif message["type"] == "http.response.body":
                if not captured["too_large"]:
                    captured["body"].extend(message.get("body", b""))
                    if len(captured["body"]) > self.max_body_bytes:
                        captured["too_large"] = True
            await send(message)

        await self.app(scope, _new_receive, _new_send)

        status = captured["status"]
        if 200 <= status < 400 and not captured["too_large"]:
            entry = {
                "body_hash": body_hash,
                "status": status,
                "headers": [
                    [k.decode("latin-1"), v.decode("latin-1")] for k, v in captured["headers"]
                ],
                "body_b64": base64.b64encode(bytes(captured["body"])).decode("ascii"),
            }
            try:
                await self.redis.set(cache_key, json.dumps(entry), ex=self.ttl)
            except Exception:  # pragma: no cover
                logger.warning("Redis idempotency store failed", exc_info=True)


def _decode_cached(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, bytes | bytearray):
        raw = raw.decode("utf-8")
    if not isinstance(raw, str):
        return None
    try:
        loaded = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(loaded, dict):
        return None
    return loaded


async def _replay(entry: dict[str, Any], send: Any) -> None:
    raw_headers = entry.get("headers") or []
    encoded_headers = [(k.encode("latin-1"), v.encode("latin-1")) for k, v in raw_headers]
    await send(
        {
            "type": "http.response.start",
            "status": int(entry.get("status", 200)),
            "headers": encoded_headers,
        }
    )
    body = base64.b64decode(entry.get("body_b64", "").encode("ascii"))
    await send({"type": "http.response.body", "body": body, "more_body": False})


async def _send_conflict(send: Any, request_id: str | None) -> None:
    err = IdempotencyKeyConflictError(
        "Idempotency-Key was previously used with a different request body"
    )
    problem = err.to_problem()
    if request_id:
        problem.request_id = request_id
    body = problem.model_dump_json(exclude_none=True).encode("utf-8")
    headers = [
        (b"content-type", CONTENT_TYPE_PROBLEM.encode("latin-1")),
        (b"content-length", str(len(body)).encode("latin-1")),
    ]
    if request_id:
        headers.append((REQUEST_ID.encode("latin-1"), request_id.encode("latin-1")))
    await send({"type": "http.response.start", "status": 409, "headers": headers})
    await send({"type": "http.response.body", "body": body, "more_body": False})


class IdempotencyStore:
    """Key/response cache for the Idempotency-Key contract handled *inside* a
    route (as opposed to the ASGI :class:`IdempotencyMiddleware`).

    Stores ``key -> (body_hash, response_payload)`` for a TTL window, Redis-backed
    with an in-memory fallback. Pass the service's TTL via ``ttl``.
    """

    def __init__(self, redis_client: Any | None = None, *, ttl: int = DEFAULT_TTL_SECONDS) -> None:
        self._redis = redis_client
        self._local: dict[str, tuple[str, dict[str, Any]]] = {}
        self._ttl = ttl

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
        await self._redis.set(f"idem:{key}", json.dumps(doc, default=str), ex=self._ttl)


__all__ = [
    "DEFAULT_MAX_BODY_BYTES",
    "DEFAULT_PREFIX",
    "DEFAULT_TTL_SECONDS",
    "IdempotencyMiddleware",
    "IdempotencyStore",
]
