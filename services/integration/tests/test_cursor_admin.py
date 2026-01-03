async def test_cursor_get_reset_set(client):
    headers = {"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"}
    r = await client.post(
        "/api/v1/integrations",
        json={"kind": "manual", "display_name": "M"},
        headers=headers,
    )
    cid = r.json()["config"]["id"]

    r1 = await client.get(f"/api/v1/integrations/{cid}/cursor", headers=headers)
    assert r1.status_code == 200
    assert r1.json()["cursor"] == {}

    r2 = await client.post(
        f"/api/v1/integrations/{cid}/cursor:set",
        json={"value": {"last_imported_at": "2026-01-01T00:00:00Z"}},
        headers=headers,
    )
    assert r2.status_code == 200

    r3 = await client.post(
        f"/api/v1/integrations/{cid}/cursor:reset", headers=headers
    )
    assert r3.status_code == 200
    assert r3.json()["cursor"] == {}


async def test_admin_health_dlq_webhook_events(client):
    headers = {"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"}
    r1 = await client.get("/api/v1/admin/integrations/health", headers=headers)
    assert r1.status_code == 200
    r2 = await client.get("/api/v1/admin/integrations/dlq", headers=headers)
    assert r2.status_code == 200
    r3 = await client.get(
        "/api/v1/admin/integrations/webhook-events", headers=headers
    )
    assert r3.status_code == 200
