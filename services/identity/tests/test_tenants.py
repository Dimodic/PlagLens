"""Tenants section F — happy paths."""
from __future__ import annotations

import pytest

from .conftest import auth_header


@pytest.mark.asyncio
async def test_list_tenants_requires_admin(client, auth_admin, seed_tenant):
    # admin is the single cross-tenant top role and is allowed to list tenants.
    r = await client.get("/api/v1/tenants", headers=auth_admin)
    assert r.status_code == 200
    data = r.json()["data"]
    assert any(t["id"] == seed_tenant.id for t in data)

    # a non-admin (e.g. a student) is denied.
    student = auth_header(user_id="usr_stu", tenant_id=seed_tenant.id, role="student")
    denied = await client.get("/api/v1/tenants", headers=student)
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_create_tenant_admin(client, auth_admin):
    r = await client.post(
        "/api/v1/tenants",
        json={"slug": "mipt", "name": "MIPT"},
        headers=auth_admin,
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
async def test_tenant_settings_roundtrip(client, auth_admin, seed_tenant):
    r = await client.patch(
        f"/api/v1/tenants/{seed_tenant.id}/settings",
        json={"cors_origins": ["https://app.example.com"], "settings": {"k": "v"}},
        headers=auth_admin,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "https://app.example.com" in body["cors_origins"]
    assert body["settings"]["k"] == "v"


@pytest.mark.asyncio
async def test_tenant_suspend_activate(client, app, auth_admin, seed_tenant):
    r1 = await client.post(
        f"/api/v1/tenants/{seed_tenant.id}:suspend", headers=auth_admin
    )
    assert r1.status_code == 200
    assert r1.json()["status"] == "suspended"
    r2 = await client.post(
        f"/api/v1/tenants/{seed_tenant.id}:activate", headers=auth_admin
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "active"
    emitted = {ev.type for _, ev in app.state.producer.events}
    assert "identity.tenant.suspended.v1" in emitted
    assert "identity.tenant.activated.v1" in emitted


@pytest.mark.asyncio
async def test_create_tenant_emits_event(client, app, auth_admin):
    r = await client.post(
        "/api/v1/tenants",
        json={"name": "HSE"},
        headers=auth_admin,
    )
    assert r.status_code == 201, r.text
    created = [
        (topic, ev)
        for topic, ev in app.state.producer.events
        if ev.type == "identity.tenant.created.v1"
    ]
    assert created, "expected an identity.tenant.created.v1 event"
    topic, ev = created[0]
    assert topic == "plaglens.identity.tenant.v1"
    assert ev.data["tenant_id"] == r.json()["id"]


@pytest.mark.asyncio
async def test_delete_tenant_emits_event(client, app, auth_admin, seed_tenant):
    # Downstream services (Course archives courses, Integration tears down its
    # per-tenant config) act on this event, so the contract matters.
    r = await client.delete(
        f"/api/v1/tenants/{seed_tenant.id}", headers=auth_admin
    )
    assert r.status_code == 204, r.text
    deleted = [
        (topic, ev)
        for topic, ev in app.state.producer.events
        if ev.type == "identity.tenant.deleted.v1"
    ]
    assert deleted, "expected an identity.tenant.deleted.v1 event"
    topic, ev = deleted[0]
    assert topic == "plaglens.identity.tenant.v1"
    assert ev.data["tenant_id"] == seed_tenant.id
