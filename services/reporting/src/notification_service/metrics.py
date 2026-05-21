"""Prometheus metrics."""
from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

notifications_created_total = Counter(
    "notifications_created_total",
    "Notifications created",
    labelnames=("event_type",),
)
notifications_delivered_total = Counter(
    "notifications_delivered_total",
    "Notification delivery results",
    labelnames=("channel", "status"),
)
notifications_delivery_duration_seconds = Histogram(
    "notifications_delivery_duration_seconds",
    "Per-channel delivery latency",
    labelnames=("channel",),
)
sse_active_connections = Gauge(
    "sse_active_connections",
    "Active SSE connections",
    labelnames=("tenant_id",),
)
email_bounces_total = Counter(
    "email_bounces_total",
    "Email bounces",
    labelnames=("type",),
)
telegram_send_errors_total = Counter(
    "telegram_send_errors_total",
    "Telegram send errors",
    labelnames=("error_type",),
)
digest_runs_total = Counter(
    "digest_runs_total",
    "Digest runs",
    labelnames=("frequency",),
)
http_requests_total = Counter(
    "http_requests_total",
    "HTTP requests",
    labelnames=("method", "route", "status"),
)


def metrics_response_body() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
