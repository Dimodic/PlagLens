"""Circuit breaker opens after a burst of 5xx and returns 503."""

from __future__ import annotations

import respx
from httpx import Response


@respx.mock
def test_circuit_opens_after_burst(client, auth_headers, monkeypatch):
    from gateway_service.circuit_breaker import breaker
    from gateway_service.config import settings

    monkeypatch.setattr(settings, "cb_min_calls", 3)
    monkeypatch.setattr(settings, "cb_failure_threshold_pct", 50)
    breaker.reset()

    respx.get("http://course-service:8080/api/v1/courses").mock(
        return_value=Response(500)
    )

    # 3 failing calls → breaker opens
    for _ in range(3):
        client.get("/api/v1/courses", headers=auth_headers)

    # Next call must short-circuit with 503.
    r = client.get("/api/v1/courses", headers=auth_headers)
    assert r.status_code == 503
    body = r.json()
    assert body["code"] == "SERVICE_UNAVAILABLE"
    assert "Retry-After" in r.headers
    breaker.reset()


@respx.mock
def test_circuit_stays_closed_with_majority_success(client, auth_headers, monkeypatch):
    from gateway_service.circuit_breaker import breaker
    from gateway_service.config import settings

    monkeypatch.setattr(settings, "cb_min_calls", 3)
    monkeypatch.setattr(settings, "cb_failure_threshold_pct", 80)
    breaker.reset()

    respx.get("http://course-service:8080/api/v1/courses").mock(
        side_effect=[Response(200, json={}), Response(500), Response(200, json={})]
    )

    for _ in range(3):
        client.get("/api/v1/courses", headers=auth_headers)

    # 4th call should still go through (breaker closed)
    respx.get("http://course-service:8080/api/v1/courses").mock(
        return_value=Response(200, json={})
    )
    r = client.get("/api/v1/courses", headers=auth_headers)
    assert r.status_code == 200
    breaker.reset()
