"""Idempotency-Key replay handling for POSTs."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from gateway_service.errors import problem_response
from gateway_service.idempotency import get as idem_get
from gateway_service.idempotency import hash_body, store
from gateway_service.metrics import idempotency_cache_hits_total


class IdempotencyMiddleware(BaseHTTPMiddleware):
    HEADER = "idempotency-key"

    async def dispatch(self, request: Request, call_next):  # noqa: D401
        if request.method.upper() != "POST":
            return await call_next(request)
        key = request.headers.get(self.HEADER)
        if not key:
            return await call_next(request)

        principal = getattr(request.state, "principal", None)
        tenant = getattr(principal, "tenant_id", None) if principal else None
        user = getattr(principal, "user_id", None) if principal else None

        body = await request.body()
        # Cache the body so downstream forwarder doesn't try to re-read.
        request.state.cached_body = body
        body_h = hash_body(body)

        existing = await idem_get(tenant, user, key)
        if existing is not None:
            if existing.body_hash != body_h:
                return problem_response(
                    status=409,
                    code="IDEMPOTENCY_KEY_CONFLICT",
                    title="Conflict",
                    detail="Same Idempotency-Key reused with a different body",
                    request=request,
                )
            idempotency_cache_hits_total.inc()
            headers = {k: v for k, v in existing.headers}
            return Response(
                content=existing.body,
                status_code=existing.status,
                headers=headers,
                media_type=headers.get("content-type"),
            )

        response: Response = await call_next(request)

        # Cache only success-class responses
        if 200 <= response.status_code < 300:
            content_bytes = b""
            existing_body = getattr(response, "body", None)
            if existing_body:
                content_bytes = bytes(existing_body)
            else:
                iterator = getattr(response, "body_iterator", None)
                if iterator is not None:
                    chunks: list[bytes] = []
                    async for chunk in iterator:
                        if isinstance(chunk, str):
                            chunk = chunk.encode("utf-8")
                        chunks.append(chunk)
                    content_bytes = b"".join(chunks)
                    # rebuild response with consumed body
                    response = Response(
                        content=content_bytes,
                        status_code=response.status_code,
                        headers=dict(response.headers),
                        media_type=response.headers.get("content-type"),
                    )
            try:
                await store(
                    tenant,
                    user,
                    key,
                    body_hash=body_h,
                    status=response.status_code,
                    headers=list(response.headers.items()),
                    body=content_bytes,
                )
            except Exception:  # noqa: S110 - cache write best-effort
                pass
        return response


__all__ = ["IdempotencyMiddleware"]
