"""Tests for Homework CRUD + filtering of assignments by homework_id.

Covers:
- create / get / update / delete homework
- list homeworks for a course (incl. status filter for students)
- assignment.homework_id field is wired and surfaced in AssignmentRead
- ``GET /api/v1/courses/{id}/assignments?homework_id=X`` filters
- ``GET /api/v1/homeworks/{id}/assignments`` lists by homework
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def _create_course(client, teacher_headers, slug: str = "hw-c") -> int:
    r = await client.post(
        "/api/v1/courses",
        json={"slug": slug, "name": "Course"},
        headers=teacher_headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_homework(
    client, teacher_headers, course_id: int, slug: str = "week-1", **extra
) -> dict:
    body = {
        "slug": slug,
        "title": "Week 1",
        "position": 0,
        "status": "draft",
    }
    body.update(extra)
    r = await client.post(
        f"/api/v1/courses/{course_id}/homeworks",
        json=body,
        headers=teacher_headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_homework_create_get_update_delete(client, teacher_headers):
    c_id = await _create_course(client, teacher_headers)

    # Create
    hw = await _create_homework(client, teacher_headers, c_id, slug="w1")
    hw_id = hw["id"]
    assert hw["slug"] == "w1"
    assert hw["course_id"] == c_id
    assert hw["status"] == "draft"
    assert hw["position"] == 0

    # Get
    r = await client.get(f"/api/v1/homeworks/{hw_id}", headers=teacher_headers)
    assert r.status_code == 200
    assert r.json()["title"] == "Week 1"

    # Update
    r = await client.patch(
        f"/api/v1/homeworks/{hw_id}",
        json={"title": "Updated", "position": 5, "status": "published"},
        headers=teacher_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Updated"
    assert body["position"] == 5
    assert body["status"] == "published"

    # Delete (soft)
    r = await client.delete(f"/api/v1/homeworks/{hw_id}", headers=teacher_headers)
    assert r.status_code == 204
    # After delete, fetcher returns 404 (deleted_at filter).
    r = await client.get(f"/api/v1/homeworks/{hw_id}", headers=teacher_headers)
    assert r.status_code == 404


async def test_homework_duplicate_slug_409(client, teacher_headers):
    c_id = await _create_course(client, teacher_headers, slug="hw-dup")
    await _create_homework(client, teacher_headers, c_id, slug="dup-1")
    r = await client.post(
        f"/api/v1/courses/{c_id}/homeworks",
        json={"slug": "dup-1", "title": "Other", "status": "draft"},
        headers=teacher_headers,
    )
    assert r.status_code == 409
    assert r.json()["code"] == "CONFLICT"


async def test_list_homeworks_for_course(client, teacher_headers):
    c_id = await _create_course(client, teacher_headers, slug="hw-list")
    await _create_homework(client, teacher_headers, c_id, slug="a")
    await _create_homework(client, teacher_headers, c_id, slug="b", position=1)
    await _create_homework(
        client, teacher_headers, c_id, slug="c", position=2, status="published"
    )
    r = await client.get(
        f"/api/v1/courses/{c_id}/homeworks", headers=teacher_headers
    )
    assert r.status_code == 200
    assert len(r.json()["data"]) == 3

    # Filter by status.
    r2 = await client.get(
        f"/api/v1/courses/{c_id}/homeworks?status=published",
        headers=teacher_headers,
    )
    assert r2.status_code == 200
    rows = r2.json()["data"]
    assert len(rows) == 1
    assert rows[0]["slug"] == "c"


async def test_student_only_sees_published_homeworks(
    client, teacher_headers, student_headers, add_member
):
    c_id = await _create_course(client, teacher_headers, slug="hw-stu")
    await _create_homework(client, teacher_headers, c_id, slug="draft-w", status="draft")
    await _create_homework(
        client, teacher_headers, c_id, slug="pub-w", status="published"
    )
    await add_member(c_id, "usr_student", role="student")
    r = await client.get(
        f"/api/v1/courses/{c_id}/homeworks", headers=student_headers
    )
    assert r.status_code == 200
    rows = r.json()["data"]
    assert len(rows) == 1
    assert rows[0]["slug"] == "pub-w"


async def test_assignment_with_homework_id(client, teacher_headers):
    c_id = await _create_course(client, teacher_headers, slug="hw-assn")
    hw = await _create_homework(client, teacher_headers, c_id, slug="hw-1")
    hw_id = hw["id"]

    # Create assignment bound to homework.
    r = await client.post(
        f"/api/v1/courses/{c_id}/assignments",
        json={
            "slug": "lab-1",
            "title": "Lab",
            "homework_id": hw_id,
        },
        headers=teacher_headers,
    )
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["homework_id"] == hw_id

    # Create another assignment without homework_id — keeps null.
    r2 = await client.post(
        f"/api/v1/courses/{c_id}/assignments",
        json={"slug": "lab-2", "title": "Lab 2"},
        headers=teacher_headers,
    )
    assert r2.status_code == 201
    assert r2.json()["homework_id"] is None

    # List assignments filtered by homework_id.
    r3 = await client.get(
        f"/api/v1/courses/{c_id}/assignments?homework_id={hw_id}",
        headers=teacher_headers,
    )
    assert r3.status_code == 200
    rows = r3.json()["data"]
    assert len(rows) == 1
    assert rows[0]["slug"] == "lab-1"

    # List via /homeworks/{id}/assignments.
    r4 = await client.get(
        f"/api/v1/homeworks/{hw_id}/assignments", headers=teacher_headers
    )
    assert r4.status_code == 200
    rows = r4.json()["data"]
    assert len(rows) == 1
    assert rows[0]["slug"] == "lab-1"


async def test_homework_emits_event(client, teacher_headers, app):
    c_id = await _create_course(client, teacher_headers, slug="hw-evt")
    producer = app.state.kafka_producer
    producer.published.clear()
    await _create_homework(client, teacher_headers, c_id, slug="evt-1")
    types = {p["envelope"]["type"] for p in producer.published}
    assert "plaglens.course.homework.created.v1" in types


async def test_legacy_assignments_still_work_without_homework_id(
    client, teacher_headers
):
    """Backward-compat: assignments without homework_id continue to be
    creatable and listable."""
    c_id = await _create_course(client, teacher_headers, slug="hw-legacy")
    r = await client.post(
        f"/api/v1/courses/{c_id}/assignments",
        json={"slug": "legacy-1", "title": "Legacy"},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["homework_id"] is None
    # List returns it.
    r2 = await client.get(
        f"/api/v1/courses/{c_id}/assignments", headers=teacher_headers
    )
    assert r2.status_code == 200
    slugs = [row["slug"] for row in r2.json()["data"]]
    assert "legacy-1" in slugs


async def test_homework_student_create_forbidden(
    client, teacher_headers, student_headers, add_member
):
    c_id = await _create_course(client, teacher_headers, slug="hw-rbac")
    await add_member(c_id, "usr_student", role="student")
    r = await client.post(
        f"/api/v1/courses/{c_id}/homeworks",
        json={"slug": "stu", "title": "x", "status": "draft"},
        headers=student_headers,
    )
    assert r.status_code == 403
