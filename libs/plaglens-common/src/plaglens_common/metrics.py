"""Prometheus metrics middleware + helpers.

See `docs/architecture/legacy/01-CROSS-CUTTING.md` §11.

The default registry is used so `/metrics` from `health.health_router` exposes
everything that this module records.
"""

from __future__ import annotations

import time
from typing import Any

try:
    from prometheus_client import (  # type: ignore[import-not-found]
        REGISTRY,
        CollectorRegistry,
        Counter,
        Histogram,
    )
except ImportError:  # pragma: no cover
    REGISTRY = None  # type: ignore[assignment]
    Counter = None  # type: ignore[assignment]
    Histogram = None  # type: ignore[assignment]
    CollectorRegistry = None  # type: ignore[assignment]


_HTTP_BUCKETS: tuple[float, ...] = (
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
)
_EXT_BUCKETS: tuple[float, ...] = (0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30)


def _get_or_create_metric(factory: Any, name: str, *args: Any, registry: Any = None, **kwargs: Any) -> Any:
    reg = registry or REGISTRY
    if reg is None:  # pragma: no cover
        raise RuntimeError("prometheus_client is not available")
    existing = getattr(reg, "_names_to_collectors", {}).get(name)
    if existing is not None:
        return existing
    return factory(name, *args, registry=reg, **kwargs)


def _http_metrics(registry: Any = None) -> tuple[Any, Any]:
    requests = _get_or_create_metric(
        Counter,
        "http_requests_total",
        "Total HTTP requests",
        ["method", "route", "status"],
        registry=registry,
    )
    duration = _get_or_create_metric(
        Histogram,
        "http_request_duration_seconds",
        "HTTP request duration",
        ["method", "route", "status"],
        buckets=_HTTP_BUCKETS,
        registry=registry,
    )
    return requests, duration


def _external_metrics(registry: Any = None) -> tuple[Any, Any]:
    duration = _get_or_create_metric(
        Histogram,
        "external_call_duration_seconds",
        "External call latency",
        ["provider", "operation", "status"],
        buckets=_EXT_BUCKETS,
        registry=registry,
    )
    errors = _get_or_create_metric(
        Counter,
        "external_call_errors_total",
        "External call errors",
        ["provider", "operation", "error_type"],
        registry=registry,
    )
    return duration, errors


class PrometheusMiddleware:
    """ASGI middleware exporting `http_requests_total` and `http_request_duration_seconds`."""

    def __init__(self, app: Any, *, registry: Any = None) -> None:
        self.app = app
        self._requests, self._duration = _http_metrics(registry)

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = (scope.get("method") or "GET").upper()
        route_holder: dict[str, str] = {"route": scope.get("path", "/"), "status": "0"}

        async def _send(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                route_holder["status"] = str(int(message.get("status", 0)))
                route = scope.get("route")
                if route is not None and getattr(route, "path", None):
                    route_holder["route"] = route.path
            await send(message)

        start = time.perf_counter()
        try:
            await self.app(scope, receive, _send)
        finally:
            elapsed = time.perf_counter() - start
            labels = (method, route_holder["route"], route_holder["status"])
            self._requests.labels(*labels).inc()
            self._duration.labels(*labels).observe(elapsed)


def record_external_call(provider: str, operation: str, duration: float, status: str) -> None:
    """Record one external API call result."""

    if REGISTRY is None:  # pragma: no cover
        return
    duration_metric, errors_metric = _external_metrics()
    duration_metric.labels(provider, operation, status).observe(duration)
    if status not in ("ok", "success"):
        errors_metric.labels(provider, operation, status).inc()


__all__ = ["PrometheusMiddleware", "record_external_call"]
