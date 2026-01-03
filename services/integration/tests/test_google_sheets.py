async def test_link_crud_and_validate(client):
    body = {"spreadsheet_id": "1abc", "sheet_name": "Sheet1", "columns_mapping": {"a": "b"}}
    headers = {
        "X-User-Id": "u",
        "X-Tenant-Id": "t",
        "X-Global-Role": "teacher",
        "X-Course-Role": "owner",
        "X-Course-Id": "crs_1",
    }
    r = await client.post(
        "/api/v1/courses/crs_1/google-sheets/link", json=body, headers=headers
    )
    assert r.status_code == 201, r.text
    rg = await client.get("/api/v1/courses/crs_1/google-sheets/link", headers=headers)
    assert rg.status_code == 200
    rp = await client.patch(
        "/api/v1/courses/crs_1/google-sheets/link",
        json={"sheet_name": "Sheet2"},
        headers=headers,
    )
    assert rp.status_code == 200
    assert rp.json()["sheet_name"] == "Sheet2"
    rv = await client.post(
        "/api/v1/courses/crs_1/google-sheets/link:validate", headers=headers
    )
    assert rv.status_code == 200
    rd = await client.delete("/api/v1/courses/crs_1/google-sheets/link", headers=headers)
    assert rd.status_code == 204


async def test_list_spreadsheets_admin_only(client):
    r = await client.get(
        "/api/v1/integrations/google-sheets/spreadsheets",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200
