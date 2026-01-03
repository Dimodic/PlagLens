"""Tenants section F — happy paths."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_tenants_requires_super_admin(client, auth_admin):
    r = await client.get("/api/v1/tenants", headers=auth_admin)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_tenants_super_admin(client, auth_super_admin, seed_tenant):
    r = await client.get("/api/v1/tenants", headers=auth_super_admin)
    assert r.status_code == 200
    data = r.json()["data"]
    assert any(t["id"] == seed_tenant.id for t in data)


@pytest.mark.asyncio
async def test_create_tenant_super_admin(client, auth_super_admin):
    r = await client.post(
        "/api/v1/tenants",
        json={"slug": "mipt", "name": "MIPT"},
        headers=auth_super_admin,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "mipt"
    assert body["name"] == "MIPT"


@pytest.mark.asyncio
async def test_get_tenant_member(client, auth_admin, seed_tenant):
    r = await client.get(f"/api/v1/tenants/{seed_tenant.id}", headers=auth_admin)
    assert r.status_code == 200
    assert r.json()["slug"] == seed_tenant.slug


@pytest.mark.asyncio
async def test_tenant_settings_roundtrip(client, auth_super_admin, seed_tenant):
    r = await client.patch(
        f"/api/v1/tenants/{seed_tenant.id}/settings",
        json={"cors_origins": ["https://app.example.com"], "settings": {"k": "v"}},
        headers=auth_super_admin,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "https://app.example.com" in body["cors_origins"]
    assert body["settings"]["k"] == "v"


@pytest.mark.asyncio
async def test_tenant_suspend_activate(client, auth_super_admin, seed_tenant):
    r1 = await client.post(
        f"/api/v1/tenants/{seed_tenant.id}:suspend", headers=auth_super_admin
    )
    assert r1.status_code == 200
    assert r1.json()["status"] == "suspended"
    r2 = await client.post(
        f"/api/v1/tenants/{seed_tenant.id}:activate", headers=auth_super_admin
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "active"
