"""One-call observability wiring: Prometheus app metrics + OpenTelemetry traces.

Call :func:`install_observability` inside each service's ``create_app()``. It:

* installs :class:`plaglens_common.metrics.PrometheusMiddleware` so ``/metrics``
  exposes real ``http_requests_total`` + ``http_request_duration_seconds`` (not
  just default process gauges), and
* configures OpenTelemetry with an OTLP exporter and instruments the FastAPI app
  + the httpx client so real spans reach the collector (Jaeger).

Everything is best-effort: a missing optional dependency logs a warning and is
skipped rather than breaking startup.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from .metrics import PrometheusMiddleware
from .tracing import configure_opentelemetry

logger = logging.getLogger(__name__)

_HTTPX_INSTRUMENTED = False


def install_observability(
    app: Any,
    *,
    service_name: str,
    otlp_endpoint: str | None = None,
    metrics: bool = True,
) -> None:
    """Wire Prometheus metrics + OpenTelemetry tracing into a FastAPI app.

    Set ``metrics=False`` for services that already expose their own Prometheus
    registry/middleware (e.g. the gateway) — tracing is still installed.
    """
    # 1. Prometheus application metrics (default registry -> health_router /metrics).
    if metrics:
        try:
            app.add_middleware(PrometheusMiddleware)
        except Exception as exc:  # pragma: no cover - never break startup
            logger.warning("prometheus middleware not installed: %s", exc)

    # 2. OpenTelemetry traces -> OTLP/gRPC (Jaeger).
    endpoint = otlp_endpoint or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    configure_opentelemetry(service_name, otlp_endpoint=endpoint)
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)
    except Exception as exc:  # pragma: no cover
        logger.warning("fastapi instrumentation skipped: %s", exc)

    # httpx is a process-global instrumentation — do it once.
    global _HTTPX_INSTRUMENTED
    if not _HTTPX_INSTRUMENTED:
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

            HTTPXClientInstrumentor().instrument()
            _HTTPX_INSTRUMENTED = True
        except Exception as exc:  # pragma: no cover
            logger.warning("httpx instrumentation skipped: %s", exc)


__all__ = ["install_observability"]
