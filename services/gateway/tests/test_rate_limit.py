"""Rate-limit per IP and per user."""

from __future__ import annotations

import respx
from httpx import Response


def test_rate_limit_per_ip_returns_429(client, monkeypatch):
    from gateway_service.config import settings

    monkeypatch.setattr(settings, "rate_limit_per_ip_rpm", 3)

    # /healthz is exempt — use /v1/version (public, but goes through rate limit)
    for _ in range(3):
        r = client.get("/v1/version")
        assert r.status_code == 200
    r = client.get("/v1/version")
    assert r.status_code == 429
    body = r.json()
    assert body["code"] == "RATE_LIMITED"
    assert "Retry-After" in r.headers
    assert "X-RateLimit-Limit" in r.headers


@respx.mock
def test_rate_limit_per_user_returns_429(client, auth_headers, monkeypatch):
    from gateway_service.config import settings

    # Make per-user limit very low; per-IP large enough not to trigger.
    monkeypatch.setattr(settings, "rate_limit_per_ip_rpm", 1000)
    monkeypatch.setattr(settings, "rate_limit_per_user_rpm", 2)

    respx.get("http://course-service:8080/api/v1/courses").mock(
        return_value=Response(200, json={"data": []})
    )
    for _ in range(2):
        r = client.get("/api/v1/courses", headers=auth_headers)
        assert r.status_code == 200
    r = client.get("/api/v1/courses", headers=auth_headers)
    assert r.status_code == 429
    assert r.json()["code"] == "RATE_LIMITED"


def test_rate_limit_headers_present_on_success(client):
    r = client.get("/v1/version")
    assert r.status_code == 200
    assert "X-RateLimit-Limit" in r.headers
    assert "X-RateLimit-Remaining" in r.headers
    assert "X-RateLimit-Reset" in r.headers
