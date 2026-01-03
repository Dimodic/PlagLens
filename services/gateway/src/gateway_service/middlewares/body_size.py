"""Reject payloads bigger than configured limits early."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from gateway_service.config import settings
from gateway_service.errors import problem_response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # noqa: D401
        cl = request.headers.get("content-length")
        ctype = (request.headers.get("content-type") or "").lower()
        is_multipart = "multipart/form-data" in ctype
        limit = settings.body_limit_multipart_bytes if is_multipart else settings.body_limit_default_bytes
        if cl is not None:
            try:
                size = int(cl)
            except ValueError:
                size = 0
            if size > limit:
                return problem_response(
                    status=413,
                    code="PAYLOAD_TOO_LARGE",
                    title="Payload Too Large",
                    detail=f"Body exceeds {limit} bytes",
                    request=request,
                )
        return await call_next(request)


__all__ = ["BodySizeLimitMiddleware"]
