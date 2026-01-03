"""Response normalization middleware.

If a backend returns a non-RFC-7807 error body (status>=400), wrap it in a
problem-detail. Successful responses pass through untouched.
"""

from __future__ import annotations

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from gateway_service.errors import problem


async def _read_body(response: Response) -> bytes:
    """Read body from any Response — plain or streaming."""
    body = getattr(response, "body", None)
    if body:
        return bytes(body)
    iterator = getattr(response, "body_iterator", None)
    if iterator is None:
        return b""
    chunks: list[bytes] = []
    async for chunk in iterator:
        if isinstance(chunk, str):
            chunk = chunk.encode("utf-8")
        chunks.append(chunk)
    return b"".join(chunks)


class ResponseNormalizationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # noqa: D401
        response: Response = await call_next(request)
        if response.status_code < 400:
            return response
        ctype = (response.headers.get("content-type") or "").lower()
        if "problem+json" in ctype:
            return response

        body = await _read_body(response)
        if "application/json" not in ctype:
            # Pass through non-JSON (HTML/text) error bodies as-is
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.headers.get("content-type"),
            )
        if not body:
            return response
        try:
            doc = json.loads(body.decode("utf-8", errors="replace"))
        except Exception:
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.headers.get("content-type"),
            )
        if isinstance(doc, dict) and "title" in doc and "status" in doc:
            # already RFC7807-ish — re-emit body so it isn't lost
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.headers.get("content-type"),
            )
        rid = getattr(request.state, "request_id", None)
        new_body = problem(
            status=response.status_code,
            code="UPSTREAM_FAILED" if response.status_code >= 500 else "BAD_REQUEST",
            title="Error",
            detail=doc.get("message") if isinstance(doc, dict) else None,
            instance=request.url.path,
            request_id=rid,
            extra={"upstream": doc},
        )
        new_resp = Response(
            content=json.dumps(new_body).encode("utf-8"),
            status_code=response.status_code,
            media_type="application/problem+json",
        )
        # carry over a couple of useful headers
        for h in ("retry-after", "x-request-id", "x-ratelimit-limit",
                  "x-ratelimit-remaining", "x-ratelimit-reset"):
            v = response.headers.get(h)
            if v:
                new_resp.headers[h] = v
        return new_resp


__all__ = ["ResponseNormalizationMiddleware"]
