"""Suspicious flag REST endpoints."""
from __future__ import annotations

from tests.conftest import teacher_headers


async def test_create_and_list_flag(client):
    headers = teacher_headers(course_id="crs_d")
    resp = await client.post(
        "/api/v1/submissions/sub_x/suspicious-flags",
        json={"reason": "manual", "severity": "medium"},
        headers=headers,
        params={"course_id": "crs_d"},
    )
    assert resp.status_code == 201
    fid = resp.json()["id"]
    listed = await client.get(
        "/api/v1/submissions/sub_x/suspicious-flags",
        headers=headers,
        params={"course_id": "crs_d"},
    )
    assert listed.status_code == 200
    ids = [f["id"] for f in listed.json()["data"]]
    assert fid in ids


async def test_dismiss_flag(client):
    headers = teacher_headers(course_id="crs_d")
    create = await client.post(
        "/api/v1/submissions/sub_y/suspicious-flags",
        json={"reason": "manual"},
        headers=headers,
        params={"course_id": "crs_d"},
    )
    fid = create.json()["id"]
    dismiss = await client.post(
        f"/api/v1/submissions/sub_y/suspicious-flags/{fid}:dismiss",
        json={"reason": "verified independent"},
        headers=headers,
        params={"course_id": "crs_d"},
    )
    assert dismiss.status_code == 200
    assert dismiss.json()["dismiss_reason"] == "verified independent"
