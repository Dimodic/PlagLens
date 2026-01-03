"""Auth section A — register / login / me / refresh / logout."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_register_then_login(client, seed_tenant):
    payload = {
        "email": "ivan@hse.ru",
        "password": "Sup3rSecret!",
        "display_name": "Иван И.",
        "tenant_slug": seed_tenant.slug,
    }
    r = await client.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user_id"]

    login_payload = {
        "email": payload["email"],
        "password": payload["password"],
        "tenant_slug": seed_tenant.slug,
    }
    r2 = await client.post("/api/v1/auth/login", json=login_payload)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["access_token"]
    assert data["expires_in"] >= 60
    assert data["user"]["email"] == payload["email"]


@pytest.mark.asyncio
async def test_login_bad_password(client, seed_tenant, seed_user):
    r = await client.post(
        "/api/v1/auth/login",
        json={
            "email": seed_user.email,
            "password": "wrong",
            "tenant_slug": seed_tenant.slug,
        },
    )
    assert r.status_code == 401
    body = r.json()
    assert body["code"] == "UNAUTHENTICATED"
    assert r.headers.get("content-type", "").startswith("application/problem+json")


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_me_with_jwt(client, auth_admin, seed_user):
    r = await client.get("/api/v1/auth/me", headers=auth_admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == seed_user.id
    assert body["global_role"] == "admin"


@pytest.mark.asyncio
async def test_refresh_without_cookie(client):
    r = await client.post("/api/v1/auth/refresh")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_logout_idempotent(client):
    r = await client.post("/api/v1/auth/logout")
    assert r.status_code == 204
