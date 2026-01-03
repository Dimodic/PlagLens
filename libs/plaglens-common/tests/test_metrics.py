from __future__ import annotations

from typing import Any

import pytest


@pytest.mark.asyncio
async def test_prometheus_middleware_records_request() -> None:
    pytest.importorskip("prometheus_client")

    from prometheus_client import REGISTRY

    from plaglens_common.metrics import PrometheusMiddleware, record_external_call

    async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok", "more_body": False})

    middleware = PrometheusMiddleware(app)
    scope = {"type": "http", "method": "GET", "path": "/foo", "headers": []}

    async def receive() -> dict[str, Any]:
        return {"type": "http.disconnect"}

    sent: list[dict[str, Any]] = []

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    await middleware(scope, receive, send)

    assert sent[0]["status"] == 200
    counter = REGISTRY.get_sample_value(
        "http_requests_total", labels={"method": "GET", "route": "/foo", "status": "200"}
    )
    assert counter is not None and counter >= 1

    record_external_call("openai", "chat.completions", 0.42, "ok")
    sample = REGISTRY.get_sample_value(
        "external_call_duration_seconds_count",
        labels={"provider": "openai", "operation": "chat.completions", "status": "ok"},
    )
    assert sample is not None and sample >= 1


def test_record_external_call_increments_errors_on_non_ok() -> None:
    pytest.importorskip("prometheus_client")
    from prometheus_client import REGISTRY

    from plaglens_common.metrics import record_external_call

    record_external_call("stepik", "list_submissions", 1.5, "timeout")
    val = REGISTRY.get_sample_value(
        "external_call_errors_total",
        labels={"provider": "stepik", "operation": "list_submissions", "error_type": "timeout"},
    )
    assert val is not None and val >= 1
