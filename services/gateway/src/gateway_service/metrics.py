"""Prometheus metrics for gateway."""

from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

# Use a custom registry so tests can spin up multiple gateways without
# duplicate-timeseries errors.
REGISTRY: CollectorRegistry = CollectorRegistry()

requests_total = Counter(
    "gateway_requests_total",
    "Total HTTP requests handled by the gateway",
    labelnames=("route", "method", "status"),
    registry=REGISTRY,
)

request_duration_seconds = Histogram(
    "gateway_request_duration_seconds",
    "Request duration handled by the gateway",
    labelnames=("route", "method"),
    registry=REGISTRY,
)

rate_limit_hits_total = Counter(
    "gateway_rate_limit_hits_total",
    "Rate-limit hits",
    labelnames=("tier",),
    registry=REGISTRY,
)

jwt_validations_total = Counter(
    "gateway_jwt_validations_total",
    "JWT validation outcomes",
    labelnames=("result",),
    registry=REGISTRY,
)

backend_errors_total = Counter(
    "gateway_backend_errors_total",
    "Errors talking to a backend service",
    labelnames=("backend", "error_type"),
    registry=REGISTRY,
)

backend_unavailable_total = Counter(
    "gateway_backend_unavailable_total",
    "Backend marked unavailable (circuit open)",
    labelnames=("backend",),
    registry=REGISTRY,
)

active_connections = Gauge(
    "gateway_active_connections",
    "In-flight requests through the gateway",
    registry=REGISTRY,
)

idempotency_cache_hits_total = Counter(
    "gateway_idempotency_cache_hits_total",
    "Idempotency-Key cache hits",
    registry=REGISTRY,
)


__all__ = [
    "REGISTRY",
    "requests_total",
    "request_duration_seconds",
    "rate_limit_hits_total",
    "jwt_validations_total",
    "backend_errors_total",
    "backend_unavailable_total",
    "active_connections",
    "idempotency_cache_hits_total",
]
