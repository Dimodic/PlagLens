"""Health/version routes + endpoint count guard."""
from __future__ import annotations

from plagiarism_service.main import app


def test_health_routes_present():
    paths = {getattr(r, "path", "") for r in app.routes}
    assert "/healthz" in paths
    assert "/readyz" in paths
    assert "/metrics" in paths
    assert "/api/v1/version" in paths


def test_endpoint_count_at_least_30():
    """We must export ≥ 30 endpoints (per spec §A–§I)."""
    paths = {(getattr(r, "path", ""), tuple(sorted(getattr(r, "methods", []) or []))) for r in app.routes}
    # Filter out internal /openapi etc.
    api_paths = {
        p for p in paths
        if p[0].startswith("/api/v1/") or p[0].startswith("/healthz")
        or p[0].startswith("/readyz") or p[0].startswith("/metrics")
        or p[0].startswith("/webhooks/")
    }
    assert len(api_paths) >= 30, f"Have only {len(api_paths)} endpoints"


async def test_healthz_endpoint(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_readyz_endpoint(client):
    resp = await client.get("/readyz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"] == {"db": "ok", "redis": "ok"}


async def test_version_endpoint(client):
    resp = await client.get("/api/v1/version")
    assert resp.status_code == 200
    body = resp.json()
    assert "version" in body
