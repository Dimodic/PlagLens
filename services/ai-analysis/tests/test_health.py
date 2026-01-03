"""Smoke tests: health, version, metrics."""
from __future__ import annotations


async def test_healthz(client) -> None:
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_readyz(client) -> None:
    r = await client.get("/readyz")
    assert r.status_code == 200


async def test_version(client) -> None:
    r = await client.get("/api/v1/version")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "ai-analysis-service"


async def test_metrics(client) -> None:
    r = await client.get("/metrics")
    assert r.status_code == 200
    assert "text/plain" in r.headers["content-type"]
