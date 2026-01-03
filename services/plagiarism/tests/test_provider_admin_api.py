"""Provider admin endpoints."""
from __future__ import annotations

from tests.conftest import admin_headers


async def test_list_providers(client):
    resp = await client.get(
        "/api/v1/admin/plagiarism/providers", headers=admin_headers()
    )
    assert resp.status_code == 200
    names = [p["provider"] for p in resp.json()["data"]]
    assert {"jplag", "moss", "codequiry", "dolos"} <= set(names)


async def test_test_provider(client):
    resp = await client.post(
        "/api/v1/admin/plagiarism/providers/jplag:test",
        headers=admin_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["ok"]


async def test_set_default(client):
    resp = await client.post(
        "/api/v1/admin/plagiarism/providers/moss:set-default",
        headers=admin_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["default_for_tenant"] is True


async def test_provider_usage(client):
    resp = await client.get(
        "/api/v1/admin/plagiarism/providers/jplag/usage",
        headers=admin_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "runs_total" in body
