"""Tests for §F (Assignments), §G (Deadlines), §H (Grading), §I (Stats)."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def _create_course(client, teacher_headers, slug: str = "as-c") -> int:
    r = await client.post(
        "/api/v1/courses",
        json={"slug": slug, "name": "Course"},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    return r.json()["id"]


async def _create_assignment(
    client, teacher_headers, course_id: int, slug: str = "lab-1"
) -> int:
    r = await client.post(
        f"/api/v1/courses/{course_id}/assignments",
        json={
            "slug": slug,
            "title": "Lab",
            "max_score": 10,
            "weight": 1.0,
            "selection_strategy": "last",
        },
        headers=teacher_headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_create_and_get_assignment(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    a_id = await _create_assignment(client, teacher_headers, c)
    r = await client.get(f"/api/v1/assignments/{a_id}", headers=teacher_headers)
    assert r.status_code == 200
    assert r.json()["slug"] == "lab-1"
    assert r.json()["status"] == "active"


async def test_archive_assignment(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    a_id = await _create_assignment(client, teacher_headers, c)
    # Archive-only lifecycle: assignments are created "active"; the legacy
    # :publish action was removed, leaving :archive as the only transition.
    r2 = await client.post(
        f"/api/v1/assignments/{a_id}:archive", headers=teacher_headers
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "archived"


async def test_update_deadline_emits_deadline_changed(client, teacher_headers, app):
    c = await _create_course(client, teacher_headers, slug="dc")
    a_id = await _create_assignment(client, teacher_headers, c, slug="dl")
    producer = app.state.kafka_producer
    producer.published.clear()
    r = await client.patch(
        f"/api/v1/assignments/{a_id}/deadlines",
        json={
            "deadline_soft_at": "2026-12-01T20:00:00+00:00",
            "deadline_hard_at": "2026-12-08T20:00:00+00:00",
            "late_score_multiplier": 0.5,
        },
        headers=teacher_headers,
    )
    assert r.status_code == 200
    types = {p["envelope"]["type"] for p in producer.published}
    assert "plaglens.course.assignment.deadline_changed.v1" in types


async def test_effective_deadline_with_extension(client, teacher_headers):
    c = await _create_course(client, teacher_headers, slug="ef")
    a_id = await _create_assignment(client, teacher_headers, c, slug="ef-a")
    # Set base deadlines.
    await client.patch(
        f"/api/v1/assignments/{a_id}/deadlines",
        json={"deadline_hard_at": "2026-12-01T20:00:00+00:00"},
        headers=teacher_headers,
    )
    # Add per-user extension.
    r_ext = await client.post(
        f"/api/v1/assignments/{a_id}/deadline-extensions",
        json={
            "user_id": "usr_alice",
            "deadline_hard_at": "2026-12-08T20:00:00+00:00",
            "reason": "medical",
        },
        headers=teacher_headers,
    )
    assert r_ext.status_code == 201
    # Read effective for alice.
    r_eff = await client.get(
        f"/api/v1/assignments/{a_id}/deadlines/effective-for/usr_alice",
        headers=teacher_headers,
    )
    assert r_eff.status_code == 200
    body = r_eff.json()
    assert body["extended"] is True
    assert "2026-12-08" in body["deadline_hard_at"]
    # Read effective for someone else — falls back to base.
    r_other = await client.get(
        f"/api/v1/assignments/{a_id}/deadlines/effective-for/usr_bob",
        headers=teacher_headers,
    )
    assert r_other.status_code == 200
    assert r_other.json()["extended"] is False


async def test_grading_config_get_and_patch(client, teacher_headers):
    c = await _create_course(client, teacher_headers, slug="gc")
    a_id = await _create_assignment(client, teacher_headers, c, slug="gc-a")
    r = await client.get(
        f"/api/v1/assignments/{a_id}/grading-config", headers=teacher_headers
    )
    assert r.status_code == 200
    r2 = await client.patch(
        f"/api/v1/assignments/{a_id}/grading-config",
        json={"rubric": {"correctness": 7, "style": 3}, "pass_threshold": 6},
        headers=teacher_headers,
    )
    assert r2.status_code == 200
    assert r2.json()["rubric"] == {"correctness": 7, "style": 3}


async def test_stats_endpoints_owner_only(client, teacher_headers, student_headers):
    c = await _create_course(client, teacher_headers, slug="st")
    a_id = await _create_assignment(client, teacher_headers, c, slug="st-a")
    r = await client.get(f"/api/v1/assignments/{a_id}/stats", headers=teacher_headers)
    assert r.status_code == 200
    # Student is not a member of this course → 404.
    r2 = await client.get(f"/api/v1/assignments/{a_id}/stats", headers=student_headers)
    assert r2.status_code in (403, 404)


async def test_assignment_duplicate(client, teacher_headers):
    c = await _create_course(client, teacher_headers, slug="dup")
    a_id = await _create_assignment(client, teacher_headers, c, slug="dup-a")
    r = await client.post(
        f"/api/v1/assignments/{a_id}:duplicate",
        json={"new_slug": "dup-b"},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    assert r.json()["slug"] == "dup-b"
