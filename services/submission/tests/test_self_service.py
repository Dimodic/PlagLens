"""Student self-service: bearer-only access to OWN submissions/grade/feedback."""
from __future__ import annotations

import pytest


async def _create_for_student(client, teacher_headers, student_id="usr_stu_1"):
    r = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=teacher_headers,
        data={"course_id": "crs_1", "author_id": student_id},
        files={"files": ("a.py", b"print(1)\n", "text/plain")},
    )
    assert r.status_code == 201
    return r.json()["id"]


@pytest.mark.asyncio
async def test_student_lists_own_submissions(
    client, teacher_headers, student_headers
):
    await _create_for_student(client, teacher_headers, "usr_stu_1")
    await _create_for_student(client, teacher_headers, "usr_stu_2")
    r = await client.get(
        "/api/v1/users/me/submissions", headers=student_headers
    )
    assert r.status_code == 200
    items = r.json()
    assert all(s["author_id"] == "usr_stu_1" for s in items)
    assert len(items) == 1


@pytest.mark.asyncio
async def test_student_cannot_access_other(
    client, teacher_headers, student_headers
):
    other_id = await _create_for_student(client, teacher_headers, "usr_stu_2")
    r = await client.get(
        f"/api/v1/users/me/submissions/{other_id}", headers=student_headers
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_student_grade_visibility(client, teacher_headers, student_headers):
    sub_id = await _create_for_student(client, teacher_headers, "usr_stu_1")
    # No grade — 404
    r0 = await client.get(
        f"/api/v1/users/me/submissions/{sub_id}/grade", headers=student_headers
    )
    assert r0.status_code == 404

    # Set grade hidden
    await client.post(
        f"/api/v1/submissions/{sub_id}/grade",
        headers=teacher_headers,
        json={"score": 5.0, "comment_visible_to_student": False},
    )
    r1 = await client.get(
        f"/api/v1/users/me/submissions/{sub_id}/grade", headers=student_headers
    )
    assert r1.status_code == 403

    # Make visible
    await client.patch(
        f"/api/v1/submissions/{sub_id}/grade",
        headers=teacher_headers,
        json={"comment_visible_to_student": True},
    )
    r2 = await client.get(
        f"/api/v1/users/me/submissions/{sub_id}/grade", headers=student_headers
    )
    assert r2.status_code == 200
    assert r2.json()["score"] == 5.0


@pytest.mark.asyncio
async def test_student_sees_only_visible_feedback(
    client, teacher_headers, student_headers
):
    sub_id = await _create_for_student(client, teacher_headers, "usr_stu_1")
    await client.post(
        f"/api/v1/submissions/{sub_id}/feedback",
        headers=teacher_headers,
        json={"body": "hidden", "visible_to_student": False},
    )
    pub = await client.post(
        f"/api/v1/submissions/{sub_id}/feedback",
        headers=teacher_headers,
        json={"body": "public", "visible_to_student": True},
    )
    assert pub.status_code == 201

    r = await client.get(
        f"/api/v1/users/me/submissions/{sub_id}/feedback", headers=student_headers
    )
    assert r.status_code == 200
    bodies = [f["body"] for f in r.json()]
    assert bodies == ["public"]


@pytest.mark.asyncio
async def test_student_plagiarism_aggregate_only(
    client, teacher_headers, student_headers
):
    sub_id = await _create_for_student(client, teacher_headers, "usr_stu_1")
    r = await client.get(
        f"/api/v1/users/me/submissions/{sub_id}/plagiarism", headers=student_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert "submission_id" in body
    assert "suspicious" in body
