from __future__ import annotations

import pytest


def test_configure_opentelemetry_returns_provider_or_none() -> None:
    from plaglens_common.tracing import configure_opentelemetry

    provider = configure_opentelemetry("svc", otlp_endpoint=None, sample_ratio=1.0)
    # Either OpenTelemetry is installed and we get a provider, or it's not.
    if provider is None:
        pytest.skip("OpenTelemetry not installed")
    assert provider is not None
    # Calling twice reuses the same provider.
    again = configure_opentelemetry("svc")
    assert again is provider
