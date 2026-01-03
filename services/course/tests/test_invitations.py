"""Tests for §D Invitations + ``POST /courses:joinByCode``."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def _create_course(client, teacher_headers) -> int:
    r = await client.post(
        "/api/v1/courses",
        json={"slug": "inv", "name": "Inv"},
        headers=teacher_headers,
    )
    return r.json()["id"]


async def test_create_invitation(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/invitations",
        json={"role": "student", "max_uses": 3},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    assert r.json()["role"] == "student"
    assert r.json()["max_uses"] == 3


async def test_join_by_code_happy_path(client, teacher_headers, student_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/invitations",
        json={"role": "student", "max_uses": 2},
        headers=teacher_headers,
    )
    code = r.json()["code"]
    r2 = await client.post(
        "/api/v1/courses:joinByCode",
        json={"code": code},
        headers=student_headers,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["course_id"] == c
    assert r2.json()["role"] == "student"


async def test_join_by_code_atomic_max_uses_enforced(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/invitations",
        json={"role": "student", "max_uses": 1},
        headers=teacher_headers,
    )
    code = r.json()["code"]
    from .conftest import auth_headers

    s1 = auth_headers(user_id="u1", global_role="student")
    s2 = auth_headers(user_id="u2", global_role="student")
    a = await client.post("/api/v1/courses:joinByCode", json={"code": code}, headers=s1)
    b = await client.post("/api/v1/courses:joinByCode", json={"code": code}, headers=s2)
    statuses = sorted([a.status_code, b.status_code])
    assert statuses == [200, 409], (a.status_code, b.status_code, a.text, b.text)


async def test_join_by_code_revoked_404(client, teacher_headers, student_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/invitations",
        json={"role": "student", "max_uses": 5},
        headers=teacher_headers,
    )
    inv_id = r.json()["id"]
    code = r.json()["code"]
    rd = await client.delete(
        f"/api/v1/courses/{c}/invitations/{inv_id}", headers=teacher_headers
    )
    assert rd.status_code == 204
    r2 = await client.post(
        "/api/v1/courses:joinByCode", json={"code": code}, headers=student_headers
    )
    assert r2.status_code == 404


async def test_bulk_invite_creates_codes(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/members:bulkInvite",
        json={"emails": ["a@x.test", "b@x.test", "c@x.test"], "role": "student"},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["created_count"] == 3
    assert len(body["invitation_codes"]) == 3
