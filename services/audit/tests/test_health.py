from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_healthz(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_version(client):
    resp = await client.get("/api/v1/version")
    assert resp.status_code == 200
    body = resp.json()
    assert body["service"] == "audit-service"
    assert "version" in body


@pytest.mark.asyncio
async def test_readyz(client):
    resp = await client.get("/readyz")
    assert resp.status_code == 200
    assert resp.json()["deps"]["db"] == "ok"


@pytest.mark.asyncio
async def test_metrics_endpoint(client):
    resp = await client.get("/metrics")
    assert resp.status_code == 200
