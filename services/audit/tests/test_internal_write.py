from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_internal_write_requires_token(client):
    resp = await client.post(
        "/api/v1/audit/events",
        json={"action": "auth.login_success"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_internal_write_rejects_bad_token(client):
    resp = await client.post(
        "/api/v1/audit/events",
        json={"action": "auth.login_success"},
        headers={"Authorization": "Bearer service:identity:wrong-token"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_internal_write_rejects_malformed(client):
    resp = await client.post(
        "/api/v1/audit/events",
        json={"action": "auth.login_success"},
        headers={"Authorization": "Bearer not-a-service-token"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_internal_write_succeeds_and_dedupes(client):
    headers = {"Authorization": "Bearer service:identity:test-internal-token"}
    body = {
        "event_id": "ext_evt_1",
        "tenant_id": "tnt_test",
        "actor": {"type": "user", "id": "usr_42", "role": "admin"},
        "action": "auth.login_failed",
        "result": "failure",
        "resource": {"type": "users", "id": "usr_42"},
        "metadata": {"reason": "bad_password"},
    }
    r1 = await client.post("/api/v1/audit/events", json=body, headers=headers)
    assert r1.status_code == 201
    assert r1.json()["deduplicated"] is False

    r2 = await client.post("/api/v1/audit/events", json=body, headers=headers)
    assert r2.status_code == 201
    assert r2.json()["deduplicated"] is True

    # Verify it's queryable.
    resp = await client.get(
        "/api/v1/audit/events",
        headers={"X-Test-Tenant-Id": "tnt_test"},
    )
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1
