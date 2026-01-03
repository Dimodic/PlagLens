"""Grading tests: assign / patch / remove / late-multiplier / hard-deadline-zero."""
from __future__ import annotations

import pytest


async def _create(client, headers, *, assignment_id="asg_1", author_id="usr_stu_1", content=b"x\n"):
    r = await client.post(
        f"/api/v1/assignments/{assignment_id}/submissions",
        headers=headers,
        data={"course_id": "crs_1", "author_id": author_id},
        files={"files": ("a.py", content, "text/plain")},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_set_get_delete_grade(client, teacher_headers):
    sub_id = await _create(client, teacher_headers)

    s = await client.post(
        f"/api/v1/submissions/{sub_id}/grade",
        headers=teacher_headers,
        json={"score": 7.0, "comment_visible_to_student": True},
    )
    assert s.status_code == 200
    g = s.json()
    assert g["score"] == 7.0
    assert g["applied_multiplier"] == 1.0

    rd = await client.get(
        f"/api/v1/submissions/{sub_id}/grade", headers=teacher_headers
    )
    assert rd.status_code == 200
    assert rd.json()["score"] == 7.0

    p = await client.patch(
        f"/api/v1/submissions/{sub_id}/grade",
        headers=teacher_headers,
        json={"score": 8.5},
    )
    assert p.status_code == 200
    assert p.json()["score"] == 8.5

    h = await client.get(
        f"/api/v1/submissions/{sub_id}/grade/history", headers=teacher_headers
    )
    assert h.status_code == 200
    assert len(h.json()) >= 2

    d = await client.delete(
        f"/api/v1/submissions/{sub_id}/grade", headers=teacher_headers
    )
    assert d.status_code == 204


@pytest.mark.asyncio
async def test_late_soft_applies_multiplier(client, teacher_headers):
    sub_id = await _create(client, teacher_headers, assignment_id="asg_late_soft")
    s = await client.post(
        f"/api/v1/submissions/{sub_id}/grade",
        headers=teacher_headers,
        json={"score": 10.0},
    )
    assert s.status_code == 200
    body = s.json()
    # 10 * 0.5 multiplier
    assert body["applied_multiplier"] == 0.5
    assert body["score"] == 5.0


@pytest.mark.asyncio
async def test_hard_deadline_forces_zero(client, teacher_headers):
    sub_id = await _create(client, teacher_headers, assignment_id="asg_late_hard")
    s = await client.post(
        f"/api/v1/submissions/{sub_id}/grade",
        headers=teacher_headers,
        json={"score": 10.0},
    )
    assert s.status_code == 200
    body = s.json()
    assert body["score"] == 0.0
    assert body["applied_multiplier"] == 0.0


@pytest.mark.asyncio
async def test_student_cannot_grade(client, student_headers, teacher_headers):
    sub_id = await _create(client, teacher_headers)
    s = await client.post(
        f"/api/v1/submissions/{sub_id}/grade",
        headers=student_headers,
        json={"score": 5.0},
    )
    assert s.status_code == 403


@pytest.mark.asyncio
async def test_remove_requires_owner(client, assistant_headers, teacher_headers):
    sub_id = await _create(client, teacher_headers)
    await client.post(
        f"/api/v1/submissions/{sub_id}/grade",
        headers=teacher_headers,
        json={"score": 5.0},
    )
    d = await client.delete(
        f"/api/v1/submissions/{sub_id}/grade", headers=assistant_headers
    )
    # assistant is not owner — cannot delete grade
    assert d.status_code == 403
