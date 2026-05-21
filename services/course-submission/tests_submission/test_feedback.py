"""Feedback tests: CRUD, publish/unpublish, llm-curated, batch publish."""
from __future__ import annotations

import pytest


async def _create(client, headers, *, author_id="usr_stu_1", content=b"x\n"):
    r = await client.post(
        "/api/v1/assignments/asg_1/submissions",
        headers=headers,
        data={"course_id": "crs_1", "author_id": author_id},
        files={"files": ("a.py", content, "text/plain")},
    )
    return r.json()["id"]


@pytest.mark.asyncio
async def test_feedback_create_publish_unpublish(client, teacher_headers):
    sub_id = await _create(client, teacher_headers)
    c = await client.post(
        f"/api/v1/submissions/{sub_id}/feedback",
        headers=teacher_headers,
        json={"body": "Nice work!", "visible_to_student": False},
    )
    assert c.status_code == 201
    fb_id = c.json()["id"]

    p = await client.post(
        f"/api/v1/submissions/{sub_id}/feedback/{fb_id}:publish",
        headers=teacher_headers,
    )
    assert p.status_code == 200
    assert p.json()["visible_to_student"] is True

    u = await client.post(
        f"/api/v1/submissions/{sub_id}/feedback/{fb_id}:unpublish",
        headers=teacher_headers,
    )
    assert u.status_code == 200
    assert u.json()["visible_to_student"] is False


@pytest.mark.asyncio
async def test_feedback_patch_and_delete(client, teacher_headers):
    sub_id = await _create(client, teacher_headers)
    c = await client.post(
        f"/api/v1/submissions/{sub_id}/feedback",
        headers=teacher_headers,
        json={"body": "old"},
    )
    fb_id = c.json()["id"]
    pa = await client.patch(
        f"/api/v1/submissions/{sub_id}/feedback/{fb_id}",
        headers=teacher_headers,
        json={"body": "new"},
    )
    assert pa.status_code == 200
    assert pa.json()["body"] == "new"

    d = await client.delete(
        f"/api/v1/submissions/{sub_id}/feedback/{fb_id}", headers=teacher_headers
    )
    assert d.status_code == 204


@pytest.mark.asyncio
async def test_feedback_from_llm(client, teacher_headers):
    sub_id = await _create(client, teacher_headers)
    r = await client.post(
        f"/api/v1/submissions/{sub_id}/feedback:from-llm",
        headers=teacher_headers,
        json={
            "ai_analysis_id": "ai_123",
            "edited_body": "edited llm output",
            "visible_to_student": True,
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["source"] == "llm_curated"
    assert body["body"] == "edited llm output"


@pytest.mark.asyncio
async def test_batch_publish_feedback(client, teacher_headers):
    sub_ids = []
    for content in (b"a\n", b"b\n"):
        sub_id = await _create(
            client,
            teacher_headers,
            author_id=f"usr_x_{content!r}",
            content=content,
        )
        sub_ids.append(sub_id)
        await client.post(
            f"/api/v1/submissions/{sub_id}/feedback",
            headers=teacher_headers,
            json={"body": "feedback", "visible_to_student": False},
        )
    r = await client.post(
        "/api/v1/assignments/asg_1/feedback:batchPublish",
        headers=teacher_headers,
        json={"submission_ids": sub_ids},
    )
    assert r.status_code == 202
    body = r.json()
    assert "operation_id" in body
