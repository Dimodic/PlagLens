"""Per-assignment config CRUD."""
from __future__ import annotations

from tests.conftest import teacher_headers


async def test_assignment_config_crud(client):
    headers = teacher_headers(course_id="crs_e")
    get0 = await client.get(
        "/api/v1/assignments/asn_99/plagiarism-config",
        headers=headers,
        params={"course_id": "crs_e"},
    )
    assert get0.status_code == 200
    patch = await client.patch(
        "/api/v1/assignments/asn_99/plagiarism-config",
        json={"provider": "dolos", "threshold": 0.75, "auto_run": True},
        headers=headers,
        params={"course_id": "crs_e"},
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["threshold"] == 0.75
    assert body["auto_run"] is True
