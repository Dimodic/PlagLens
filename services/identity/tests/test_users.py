"""Users section G — CRUD happy paths."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_users_requires_role(client):
    r = await client.get("/api/v1/users")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_users_admin(client, auth_admin, seed_user):
    r = await client.get("/api/v1/users", headers=auth_admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "data" in body
    assert any(u["id"] == seed_user.id for u in body["data"])


@pytest.mark.asyncio
async def test_create_user_admin(client, auth_admin, seed_tenant):
    payload = {
        "email": "newbie@hse.ru",
        "display_name": "Newbie",
        "global_role": "student",
        "tenant_id": seed_tenant.id,
    }
    r = await client.post("/api/v1/users", json=payload, headers=auth_admin)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == payload["email"]
    assert body["global_role"] == "student"


@pytest.mark.asyncio
async def test_get_user_self(client, auth_admin, seed_user):
    r = await client.get(f"/api/v1/users/{seed_user.id}", headers=auth_admin)
    assert r.status_code == 200
    assert r.json()["email"] == seed_user.email


@pytest.mark.asyncio
async def test_disable_then_enable(client, auth_admin, seed_user):
    r1 = await client.post(
        f"/api/v1/users/{seed_user.id}:disable", headers=auth_admin
    )
    assert r1.status_code == 200
    assert r1.json()["status"] == "disabled"
    r2 = await client.post(
        f"/api/v1/users/{seed_user.id}:enable", headers=auth_admin
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "active"


@pytest.mark.asyncio
async def test_roles_endpoint(client, auth_admin):
    r = await client.get("/api/v1/roles", headers=auth_admin)
    assert r.status_code == 200
    roles = [item["role"] for item in r.json()]
    assert "admin" in roles
    assert "student" in roles


@pytest.mark.asyncio
async def test_role_permissions(client, auth_admin):
    r = await client.get("/api/v1/roles/admin/permissions", headers=auth_admin)
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "admin"
    assert "user.list" in body["permissions"]
