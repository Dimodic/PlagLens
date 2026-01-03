"""Structured access log + Prometheus counters for every request."""

from __future__ import annotations

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from gateway_service.logging import get_logger
from gateway_service.metrics import (
    active_connections,
    request_duration_seconds,
    requests_total,
)

log = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # noqa: D401
        start = time.perf_counter()
        active_connections.inc()
        method = request.method
        path = request.url.path
        log.info("request_start", method=method, path=path)
        try:
            response: Response = await call_next(request)
        except Exception as e:
            duration = time.perf_counter() - start
            log.error(
                "request_error",
                method=method,
                path=path,
                error=type(e).__name__,
                duration_ms=round(duration * 1000, 2),
            )
            requests_total.labels(route=path, method=method, status="500").inc()
            request_duration_seconds.labels(route=path, method=method).observe(duration)
            active_connections.dec()
            raise
        else:
            duration = time.perf_counter() - start
            requests_total.labels(
                route=path, method=method, status=str(response.status_code)
            ).inc()
            request_duration_seconds.labels(route=path, method=method).observe(duration)
            log.info(
                "request_end",
                method=method,
                path=path,
                status=response.status_code,
                duration_ms=round(duration * 1000, 2),
            )
            return response
        finally:
            active_connections.dec()


__all__ = ["LoggingMiddleware"]
