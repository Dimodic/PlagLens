"""Request middleware: X-Request-Id propagation, basic Prometheus metrics."""
from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Histogram,
    generate_latest,
)
from starlette.middleware.base import BaseHTTPMiddleware

REQ_COUNT = Counter(
    "http_requests_total",
    "HTTP requests",
    ["method", "route", "status"],
)
REQ_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration",
    ["method", "route"],
)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex
        request.state.request_id = rid
        started = time.monotonic()
        try:
            response = await call_next(request)
        except Exception:
            REQ_COUNT.labels(
                request.method,
                request.url.path,
                "500",
            ).inc()
            raise
        elapsed = time.monotonic() - started
        REQ_COUNT.labels(
            request.method,
            request.url.path,
            str(response.status_code),
        ).inc()
        REQ_DURATION.labels(request.method, request.url.path).observe(elapsed)
        response.headers["X-Request-Id"] = rid
        return response


def metrics_response() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


def install_middleware(app: FastAPI) -> None:
    app.add_middleware(RequestIdMiddleware)
