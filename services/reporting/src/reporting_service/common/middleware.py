"""Request-id middleware + RFC 7807 exception handlers."""

from __future__ import annotations

import uuid

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware

from .problem import make_handlers


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response


def install_exception_handlers(app: FastAPI) -> None:
    for exc_type, handler in make_handlers().items():
        app.add_exception_handler(exc_type, handler)
