async def test_create_get_list_patch_delete(client):
    payload = {
        "kind": "manual",
        "course_id": "crs_42",
        "display_name": "Manual Upload",
        "settings": {},
    }
    r = await client.post(
        "/api/v1/integrations",
        json=payload,
        headers={"X-User-Id": "usr_t", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    cid = body["config"]["id"]
    assert body["config"]["status"] == "active"

    r = await client.get(
        f"/api/v1/integrations/{cid}",
        headers={"X-User-Id": "usr_t", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200

    r = await client.get(
        "/api/v1/integrations",
        headers={"X-User-Id": "usr_t", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200
    assert any(c["id"] == cid for c in r.json()["data"])

    r = await client.patch(
        f"/api/v1/integrations/{cid}",
        json={"display_name": "Renamed"},
        headers={"X-User-Id": "usr_t", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "Renamed"

    r = await client.post(
        f"/api/v1/integrations/{cid}:disable",
        headers={"X-User-Id": "usr_t", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "disabled"

    r = await client.delete(
        f"/api/v1/integrations/{cid}",
        headers={"X-User-Id": "usr_t", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 204


async def test_idempotency_replay(client):
    headers = {
        "X-User-Id": "usr_t",
        "X-Tenant-Id": "tnt_x",
        "X-Global-Role": "admin",
        "Idempotency-Key": "key-abc-1",
    }
    body = {"kind": "manual", "display_name": "X"}
    r1 = await client.post("/api/v1/integrations", json=body, headers=headers)
    r2 = await client.post("/api/v1/integrations", json=body, headers=headers)
    assert r1.status_code == 201
    assert r2.status_code in (200, 201)
    assert r1.json()["config"]["id"] == r2.json()["config"]["id"]

    body2 = {"kind": "manual", "display_name": "Y"}
    r3 = await client.post("/api/v1/integrations", json=body2, headers=headers)
    assert r3.status_code == 409
