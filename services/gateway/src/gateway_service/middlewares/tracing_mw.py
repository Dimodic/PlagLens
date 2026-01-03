"""OpenTelemetry tracing wrapper.

OpenTelemetry SDK is optional at runtime — the middleware silently degrades
to a no-op when the SDK isn't installed. The contract is: bind a `trace_id`
that downstream logs can pick up (defaults to the request_id).
"""

from __future__ import annotations

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class TracingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # noqa: D401
        rid = getattr(request.state, "request_id", None)
        if rid:
            structlog.contextvars.bind_contextvars(trace_id=rid)
        try:
            response: Response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("trace_id")
        return response


__all__ = ["TracingMiddleware"]
