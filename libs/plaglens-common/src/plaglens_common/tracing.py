"""OpenTelemetry tracing setup.

See `docs/architecture/legacy/01-CROSS-CUTTING.md` §12.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def configure_opentelemetry(
    service_name: str,
    *,
    otlp_endpoint: str | None = None,
    sample_ratio: float | None = None,
    resource_attrs: dict[str, str] | None = None,
) -> Any:
    """Initialise OpenTelemetry tracing with an OTLP/gRPC exporter.

    Returns the configured `TracerProvider` (or `None` if dependencies are missing).
    Safe to call multiple times — existing provider is reused.
    """

    try:
        from opentelemetry import trace  # type: ignore[import-not-found]
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (  # type: ignore[import-not-found]
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.resources import Resource  # type: ignore[import-not-found]
        from opentelemetry.sdk.trace import TracerProvider  # type: ignore[import-not-found]
        from opentelemetry.sdk.trace.export import BatchSpanProcessor  # type: ignore[import-not-found]
        from opentelemetry.sdk.trace.sampling import (  # type: ignore[import-not-found]
            ParentBased,
            TraceIdRatioBased,
        )
    except ImportError as imp_err:  # pragma: no cover
        logger.warning("OpenTelemetry not installed; tracing disabled: %s", imp_err)
        return None

    existing = trace.get_tracer_provider()
    if isinstance(existing, TracerProvider):
        return existing

    attrs = {"service.name": service_name}
    if resource_attrs:
        attrs.update(resource_attrs)
    resource = Resource.create(attrs)

    sampler = None
    if sample_ratio is not None:
        sampler = ParentBased(root=TraceIdRatioBased(sample_ratio))

    provider = TracerProvider(resource=resource, sampler=sampler) if sampler else TracerProvider(resource=resource)
    if otlp_endpoint:
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint)))
    trace.set_tracer_provider(provider)
    return provider


__all__ = ["configure_opentelemetry"]
