"""Tests for §A Courses + §B Owners + duplicate."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_create_course_201_with_location(client, teacher_headers):
    resp = await client.post(
        "/api/v1/courses",
        json={"slug": "ds-2026", "name": "Анализ данных"},
        headers=teacher_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["slug"] == "ds-2026"
    assert body["name"] == "Анализ данных"
    assert body["owner_id"] == "usr_owner"
    assert resp.headers.get("location", "").endswith(f"/api/v1/courses/{body['id']}")


async def test_create_course_student_forbidden(client, student_headers):
    resp = await client.post(
        "/api/v1/courses",
        json={"slug": "ds-2026", "name": "x"},
        headers=student_headers,
    )
    assert resp.status_code == 403
    assert resp.headers["content-type"].startswith("application/problem+json")


async def test_create_course_duplicate_slug_409(client, teacher_headers):
    payload = {"slug": "lab", "name": "Lab"}
    r1 = await client.post("/api/v1/courses", json=payload, headers=teacher_headers)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/courses", json=payload, headers=teacher_headers)
    assert r2.status_code == 409
    assert r2.json()["code"] == "CONFLICT"


async def test_get_course_member_visible(client, teacher_headers, make_course):
    course = await make_course(slug="cs-1", owner_id="usr_owner")
    resp = await client.get(f"/api/v1/courses/{course.id}", headers=teacher_headers)
    assert resp.status_code == 200
    assert resp.json()["slug"] == "cs-1"


async def test_list_courses_paginated(client, teacher_headers, make_course):
    for i in range(3):
        await make_course(slug=f"slug-{i}", name=f"name-{i}")
    resp = await client.get("/api/v1/courses?limit=2", headers=teacher_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 2
    assert body["pagination"]["has_more"] is True
    assert body["pagination"]["next_cursor"] is not None
    cur = body["pagination"]["next_cursor"]
    resp2 = await client.get(f"/api/v1/courses?limit=2&cursor={cur}", headers=teacher_headers)
    assert resp2.status_code == 200
    assert resp2.json()["pagination"]["has_more"] is False


async def test_patch_course(client, teacher_headers, make_course):
    course = await make_course(slug="patch", owner_id="usr_owner")
    resp = await client.patch(
        f"/api/v1/courses/{course.id}",
        json={"name": "New name"},
        headers=teacher_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New name"


async def test_archive_unarchive(client, teacher_headers, make_course):
    course = await make_course(slug="arch", owner_id="usr_owner")
    r1 = await client.post(
        f"/api/v1/courses/{course.id}:archive", headers=teacher_headers
    )
    assert r1.status_code == 200
    assert r1.json()["status"] == "archived"
    r2 = await client.post(
        f"/api/v1/courses/{course.id}:unarchive", headers=teacher_headers
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "active"


async def test_delete_course_204(client, teacher_headers, make_course):
    course = await make_course(slug="del", owner_id="usr_owner")
    resp = await client.delete(f"/api/v1/courses/{course.id}", headers=teacher_headers)
    assert resp.status_code == 204


async def test_duplicate_course_deep_copies_assignments(
    client, teacher_headers, make_course
):
    course = await make_course(slug="src", owner_id="usr_owner")
    a_payload = {
        "slug": "lab-1",
        "title": "Lab 1",
        "max_score": 10,
        "weight": 1.0,
        "selection_strategy": "best",
    }
    r_a = await client.post(
        f"/api/v1/courses/{course.id}/assignments",
        json=a_payload,
        headers=teacher_headers,
    )
    assert r_a.status_code == 201
    resp = await client.post(
        f"/api/v1/courses/{course.id}:duplicate",
        json={"new_slug": "src-copy"},
        headers=teacher_headers,
    )
    assert resp.status_code == 201
    new_id = resp.json()["id"]
    list_r = await client.get(
        f"/api/v1/courses/{new_id}/assignments", headers=teacher_headers
    )
    assert list_r.status_code == 200
    assert len(list_r.json()["data"]) == 1
    assert list_r.json()["data"][0]["slug"] == "lab-1"
    assert list_r.json()["data"][0]["status"] == "active"


async def test_owners_add_promote_remove(client, teacher_headers, make_course):
    course = await make_course(slug="ownr", owner_id="usr_owner")
    # Add co-owner.
    r_add = await client.post(
        f"/api/v1/courses/{course.id}/owners",
        json={"user_id": "usr_co"},
        headers=teacher_headers,
    )
    assert r_add.status_code == 201
    assert r_add.json()["role"] == "co_owner"
    # Promote co-owner.
    r_pr = await client.post(
        f"/api/v1/courses/{course.id}/owners/usr_co:promote",
        headers=teacher_headers,
    )
    assert r_pr.status_code == 200
    assert r_pr.json()["owner_id"] == "usr_co"
    # Now usr_owner is co_owner; remove them.
    r_del = await client.delete(
        f"/api/v1/courses/{course.id}/owners/usr_owner",
        headers=teacher_headers,
    )
    assert r_del.status_code == 204


async def test_tenant_isolation(client, make_course):
    """A user from tenant B cannot see course from tenant A."""
    course = await make_course(slug="iso-a", tenant_id="tnt_a", owner_id="usr_a")
    from .conftest import auth_headers

    # Same user_id but different tenant_id — must 404.
    resp = await client.get(
        f"/api/v1/courses/{course.id}",
        headers=auth_headers(user_id="usr_b", tenant_id="tnt_b", global_role="teacher"),
    )
    assert resp.status_code == 404


async def test_health_endpoints(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    r2 = await client.get("/api/v1/version")
    assert r2.status_code == 200
    assert r2.json()["service"] == "course-service"
