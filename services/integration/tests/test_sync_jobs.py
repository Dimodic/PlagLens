async def _make(client):
    r = await client.post(
        "/api/v1/integrations",
        json={"kind": "manual", "display_name": "M"},
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 201
    return r.json()["config"]["id"]


async def test_sync_creates_job_and_lifecycle(client):
    cid = await _make(client)
    r = await client.post(
        f"/api/v1/integrations/{cid}/sync",
        json={"scope": {}, "force_full": True},
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 202, r.text
    op = r.json()
    job_id = op["id"]

    r2 = await client.get(
        f"/api/v1/integrations/{cid}/import-jobs",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r2.status_code == 200
    assert any(j["id"] == job_id for j in r2.json()["data"])

    r3 = await client.get(
        f"/api/v1/integrations/{cid}/import-jobs/{job_id}",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r3.status_code == 200

    r4 = await client.post(
        f"/api/v1/integrations/{cid}/import-jobs/{job_id}:cancel",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r4.status_code == 200
    assert r4.json()["status"] == "cancelled"

    r5 = await client.post(
        f"/api/v1/integrations/{cid}/import-jobs/{job_id}:retry",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r5.status_code == 200
    assert r5.json()["status"] == "queued"
