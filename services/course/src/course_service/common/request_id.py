"""``X-Request-Id`` middleware — propagates / generates correlation ids."""

from __future__ import annotations

import uuid

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger(__name__)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex
        request.state.request_id = rid
        response = await call_next(request)
        response.headers.setdefault("X-Request-Id", rid)
        return response
