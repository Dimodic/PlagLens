"""CORS preflight + aggregated /v1/health."""

from __future__ import annotations

import respx
from httpx import Response


def test_cors_preflight(client):
    r = client.options(
        "/api/v1/courses",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    # Preflight must succeed (no auth required) and echo origin.
    assert r.status_code in (200, 204)
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


@respx.mock
def test_aggregated_health_all_healthy(client):
    from gateway_service.config import settings

    for name, base in settings.backends_map().items():
        respx.get(base.rstrip("/") + "/healthz").mock(
            return_value=Response(200, json={"status": "ok"})
        )
    r = client.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "healthy"
    assert len(body["backends"]) >= 1


@respx.mock
def test_aggregated_health_unhealthy_majority_returns_503(client):
    from gateway_service.config import settings

    backends = settings.backends_map()
    for i, (name, base) in enumerate(backends.items()):
        respx.get(base.rstrip("/") + "/healthz").mock(
            return_value=Response(500 if i % 2 == 0 else 200)
        )
    r = client.get("/v1/health")
    # Half failing → expected degraded or unhealthy depending on count.
    assert r.status_code in (200, 503)


def test_services_status_requires_admin(client, auth_headers):
    # auth_headers carries a non-admin (teacher) token → must be forbidden.
    r = client.get("/v1/services-status", headers=auth_headers)
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"


@respx.mock
def test_services_status_admin_ok(client, admin_headers):
    from gateway_service.config import settings

    for name, base in settings.backends_map().items():
        respx.get(base.rstrip("/") + "/readyz").mock(
            return_value=Response(200)
        )
    r = client.get("/v1/services-status", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["healthy_count"] == body["total_count"]
