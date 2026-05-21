"""End-to-end tests for submissions read/write & files."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_create_manual_upload_returns_201(client, teacher_headers):
    files = {"files": ("a.py", b"print(1)\n", "text/plain")}
    r = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "language": "python", "author_id": "usr_stu_1"},
        files=files,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["assignment_id"] == "asg_1"
    assert body["language"] == "python"
    assert body["status"] == "ready"
    assert body["version"] == 1
    sub_id = body["id"]

    g = await client.get(f"/api/v1/submissions/{sub_id}", headers=teacher_headers)
    assert g.status_code == 200
    detail = g.json()
    assert len(detail["files"]) == 1
    assert detail["files"][0]["path"] == "a.py"

    fl = await client.get(
        f"/api/v1/submissions/{sub_id}/files", headers=teacher_headers
    )
    assert fl.status_code == 200
    assert len(fl.json()) == 1

    file_id = detail["files"][0]["id"]
    fc = await client.get(
        f"/api/v1/submissions/{sub_id}/files/{file_id}/content",
        headers=teacher_headers,
    )
    assert fc.status_code == 200
    assert "print(1)" in fc.text


@pytest.mark.asyncio
async def test_list_by_assignment_filters(client, teacher_headers):
    await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "language": "python", "author_id": "usr_stu_1"},
        files={"files": ("a.py", b"print(1)\n", "text/plain")},
    )
    await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "language": "go", "author_id": "usr_stu_2"},
        files={"files": ("a.go", b"package main\n", "text/plain")},
    )
    r = await client.get(
        "/api/v1/assignments/asg_1/submissions?language=python",
        headers=teacher_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert all(s["language"] == "python" for s in body["data"])
    assert len(body["data"]) == 1


@pytest.mark.asyncio
async def test_versions_increment_per_author(client, teacher_headers):
    for content in (b"v1\n", b"v2\n", b"v3\n"):
        r = await client.post(
            "/api/v1/assignments/asg_1/submissions",
            headers=teacher_headers,
            data={
                "course_id": "crs_1",
                "language": "python",
                "author_id": "usr_stu_1",
            },
            files={"files": ("a.py", content, "text/plain")},
        )
        assert r.status_code == 201
    r = await client.get(
        "/api/v1/assignments/asg_1/submissions?author_id=usr_stu_1",
        headers=teacher_headers,
    )
    body = r.json()
    versions = sorted(s["version"] for s in body["data"])
    assert versions == [1, 2, 3]


@pytest.mark.asyncio
async def test_latest_and_selected_per_student(client, teacher_headers):
    await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": "usr_stu_1"},
        files={"files": ("a.py", b"v1\n", "text/plain")},
    )
    await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": "usr_stu_1"},
        files={"files": ("a.py", b"v2\n", "text/plain")},
    )
    r = await client.get(
        "/api/v1/assignments/asg_1/submissions/latest-per-student",
        headers=teacher_headers,
    )
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["version"] == 2

    sel = await client.get(
        "/api/v1/assignments/asg_1/submissions/selected-per-student",
        headers=teacher_headers,
    )
    assert sel.status_code == 200
    sel_items = sel.json()
    # strategy=last means only the v2 should be selected
    assert len(sel_items) == 1
    assert sel_items[0]["version"] == 2


@pytest.mark.asyncio
async def test_select_unselect(client, teacher_headers):
    r = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": "usr_stu_1"},
        files={"files": ("a.py", b"x\n", "text/plain")},
    )
    sub_id = r.json()["id"]
    u = await client.post(
        f"/api/v1/submissions/{sub_id}:unselect", headers=teacher_headers
    )
    assert u.status_code == 200
    assert u.json()["selected_for_grading"] is False
    s = await client.post(
        f"/api/v1/submissions/{sub_id}:select", headers=teacher_headers
    )
    assert s.status_code == 200
    assert s.json()["selected_for_grading"] is True


@pytest.mark.asyncio
async def test_soft_delete(client, teacher_headers):
    r = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": "usr_stu_1"},
        files={"files": ("a.py", b"x\n", "text/plain")},
    )
    sub_id = r.json()["id"]
    d = await client.delete(
        f"/api/v1/submissions/{sub_id}", headers=teacher_headers
    )
    assert d.status_code == 204
    g = await client.get(
        f"/api/v1/submissions/{sub_id}", headers=teacher_headers
    )
    assert g.status_code == 404


@pytest.mark.asyncio
async def test_history_endpoint(client, teacher_headers):
    sub_ids = []
    for content in (b"a\n", b"b\n"):
        r = await client.post(
            "/api/v1/assignments/asg_1/submissions",
            headers=teacher_headers,
            data={"course_id": "crs_1", "author_id": "usr_stu_1"},
            files={"files": ("a.py", content, "text/plain")},
        )
        sub_ids.append(r.json()["id"])
    h = await client.get(
        f"/api/v1/submissions/{sub_ids[0]}/history", headers=teacher_headers
    )
    assert h.status_code == 200
    assert len(h.json()) == 2


@pytest.mark.asyncio
async def test_diff_endpoint(client, teacher_headers):
    a = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": "usr_stu_1"},
        files={"files": ("a.py", b"x = 1\n", "text/plain")},
    )
    b = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": "usr_stu_2"},
        files={"files": ("a.py", b"x = 2\n", "text/plain")},
    )
    d = await client.get(
        f"/api/v1/submissions/{a.json()['id']}/diff",
        params={"against": b.json()["id"]},
        headers=teacher_headers,
    )
    assert d.status_code == 200
    body = d.json()
    assert body["files"]
    assert "x = 1" in body["files"][0]["diff"] or "x = 2" in body["files"][0]["diff"]


@pytest.mark.asyncio
async def test_health_endpoints(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    r2 = await client.get("/v1/version")
    assert r2.status_code == 200
    r3 = await client.get("/metrics")
    assert r3.status_code == 200
