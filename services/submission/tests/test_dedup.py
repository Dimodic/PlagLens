"""Deduplication tests: same content for same (assignment, author) returns existing."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_dedup_returns_200_with_same_id(client, teacher_headers):
    payload = {"course_id": "crs_1", "author_id": "usr_stu_1", "language": "python"}
    files = {"files": ("a.py", b"print(1)\n", "text/plain")}

    r1 = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data=payload,
        files=files,
    )
    assert r1.status_code == 201
    sub_id = r1.json()["id"]

    # Re-upload same bytes for same assignment+author — should dedup.
    files2 = {"files": ("a.py", b"print(1)\n", "text/plain")}
    r2 = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data=payload,
        files=files2,
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == sub_id
    assert r2.json()["version"] == 1


@pytest.mark.asyncio
async def test_different_content_creates_new_version(client, teacher_headers):
    payload = {"course_id": "crs_1", "author_id": "usr_stu_1"}
    r1 = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data=payload,
        files={"files": ("a.py", b"v1\n", "text/plain")},
    )
    r2 = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data=payload,
        files={"files": ("a.py", b"v2\n", "text/plain")},
    )
    assert r1.json()["id"] != r2.json()["id"]
    assert r1.json()["version"] == 1
    assert r2.json()["version"] == 2


@pytest.mark.asyncio
async def test_different_author_does_not_dedup(client, teacher_headers):
    files1 = {"files": ("a.py", b"x\n", "text/plain")}
    files2 = {"files": ("a.py", b"x\n", "text/plain")}
    r1 = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": "usr_stu_1"},
        files=files1,
    )
    r2 = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": "usr_stu_2"},
        files=files2,
    )
    assert r1.json()["id"] != r2.json()["id"]
