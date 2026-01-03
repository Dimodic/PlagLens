"""Per-submission view: only-percentage for student, full for teacher."""
from __future__ import annotations

from tests.conftest import student_headers, teacher_headers


async def test_student_percentage_self(client):
    headers = student_headers(user="usr_42", course_id="crs_z")
    resp = await client.get(
        "/api/v1/submissions/sub_42/plagiarism/percentage",
        headers=headers,
        params={"course_id": "crs_z", "submission_author_id": "usr_42"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "submission_id" in body
    assert "max_similarity_with_others" in body
    # No fragments / pairs leaked.
    assert "fragments" not in body
    assert "pairs" not in body


async def test_student_cannot_see_others_percentage(client):
    headers = student_headers(user="usr_someone_else", course_id="crs_z")
    resp = await client.get(
        "/api/v1/submissions/sub_42/plagiarism/percentage",
        headers=headers,
        params={"course_id": "crs_z", "submission_author_id": "usr_42"},
    )
    assert resp.status_code == 403


async def test_teacher_can_view_latest(client):
    resp = await client.get(
        "/api/v1/submissions/sub_42/plagiarism",
        headers=teacher_headers(course_id="crs_z"),
        params={"course_id": "crs_z"},
    )
    assert resp.status_code == 200
