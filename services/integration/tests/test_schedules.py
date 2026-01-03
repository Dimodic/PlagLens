async def _make(client):
    r = await client.post(
        "/api/v1/integrations",
        json={"kind": "manual", "display_name": "M"},
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 201
    return r.json()["config"]["id"]


async def test_schedule_crud_and_run_now(client):
    cid = await _make(client)
    r = await client.post(
        f"/api/v1/integrations/{cid}/schedules",
        json={"cron": "*/15 * * * *", "scope": {}, "enabled": True},
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["next_run_at"] is not None

    r2 = await client.get(
        f"/api/v1/integrations/{cid}/schedules",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r2.status_code == 200
    assert any(s["id"] == sid for s in r2.json()["data"])

    r3 = await client.patch(
        f"/api/v1/integrations/{cid}/schedules/{sid}",
        json={"enabled": False},
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r3.status_code == 200
    assert r3.json()["enabled"] is False

    r4 = await client.post(
        f"/api/v1/integrations/{cid}/schedules/{sid}:run-now",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r4.status_code == 200
    assert "job_id" in r4.json()

    r5 = await client.delete(
        f"/api/v1/integrations/{cid}/schedules/{sid}",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r5.status_code == 204


async def test_schedule_cron_validation(client):
    cid = await _make(client)
    r = await client.post(
        f"/api/v1/integrations/{cid}/schedules",
        json={"cron": "not-cron"},
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 422
