"""Tests for §C Members."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def _create_course(client, teacher_headers) -> int:
    r = await client.post(
        "/api/v1/courses",
        json={"slug": "mem", "name": "M"},
        headers=teacher_headers,
    )
    return r.json()["id"]


async def test_add_and_list_members(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/members",
        json={"user_id": "usr_s1", "role": "student"},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    rl = await client.get(f"/api/v1/courses/{c}/members", headers=teacher_headers)
    assert rl.status_code == 200
    assert any(m["user_id"] == "usr_s1" for m in rl.json()["data"])


async def test_batch_create_members(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/members:batchCreate",
        json={"members": [{"user_id": f"u{i}", "role": "student"} for i in range(5)]},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    assert len(r.json()) == 5


async def test_update_member_role(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    await client.post(
        f"/api/v1/courses/{c}/members",
        json={"user_id": "usr_s2", "role": "student"},
        headers=teacher_headers,
    )
    r = await client.patch(
        f"/api/v1/courses/{c}/members/usr_s2",
        json={"role": "assistant"},
        headers=teacher_headers,
    )
    assert r.status_code == 200
    assert r.json()["role"] == "assistant"


async def test_remove_member(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    await client.post(
        f"/api/v1/courses/{c}/members",
        json={"user_id": "usr_s3", "role": "student"},
        headers=teacher_headers,
    )
    r = await client.delete(
        f"/api/v1/courses/{c}/members/usr_s3", headers=teacher_headers
    )
    assert r.status_code == 204
    r2 = await client.get(
        f"/api/v1/courses/{c}/members/usr_s3", headers=teacher_headers
    )
    assert r2.status_code == 404


async def test_student_cannot_add_member(client, teacher_headers, student_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/members",
        json={"user_id": "usr_x", "role": "student"},
        headers=student_headers,
    )
    # student is not a member of the course → 404 (course not visible).
    assert r.status_code in (403, 404)


async def test_self_can_view_own_membership(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    await client.post(
        f"/api/v1/courses/{c}/members",
        json={"user_id": "usr_self", "role": "student"},
        headers=teacher_headers,
    )
    from .conftest import auth_headers

    self_h = auth_headers(user_id="usr_self", global_role="student")
    r = await client.get(
        f"/api/v1/courses/{c}/members/usr_self", headers=self_h
    )
    assert r.status_code == 200
