"""Pin a `X-Request-Id` to every request and response.

If the client supplied one, we use it (after validating shape). Otherwise we
generate a UUID4. The id is also bound to structlog contextvars so all logs
emitted while handling the request carry it.
"""

from __future__ import annotations

import re
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_RE_VALID = re.compile(r"^[A-Za-z0-9_\-]{8,64}$")


class RequestIdMiddleware(BaseHTTPMiddleware):
    HEADER = "x-request-id"

    async def dispatch(self, request: Request, call_next):  # noqa: D401
        rid = request.headers.get(self.HEADER)
        if not rid or not _RE_VALID.match(rid):
            rid = uuid.uuid4().hex
        request.state.request_id = rid
        structlog.contextvars.bind_contextvars(request_id=rid)
        try:
            response: Response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("request_id")
        response.headers["X-Request-Id"] = rid
        return response


__all__ = ["RequestIdMiddleware"]
