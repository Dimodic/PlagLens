"""Tests for §E Groups + group members."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def _create_course(client, teacher_headers) -> int:
    r = await client.post(
        "/api/v1/courses",
        json={"slug": "grp", "name": "G"},
        headers=teacher_headers,
    )
    return r.json()["id"]


async def test_create_and_list_groups(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/groups",
        json={"name": "Group A", "capacity": 25},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    g_id = r.json()["id"]
    rl = await client.get(f"/api/v1/courses/{c}/groups", headers=teacher_headers)
    assert rl.status_code == 200
    assert any(g["id"] == g_id for g in rl.json()["data"])


async def test_update_group(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/groups",
        json={"name": "G1"},
        headers=teacher_headers,
    )
    gid = r.json()["id"]
    r2 = await client.patch(
        f"/api/v1/courses/{c}/groups/{gid}",
        json={"name": "G1 renamed", "capacity": 50},
        headers=teacher_headers,
    )
    assert r2.status_code == 200
    assert r2.json()["name"] == "G1 renamed"
    assert r2.json()["capacity"] == 50


async def test_add_remove_group_member(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    g = await client.post(
        f"/api/v1/courses/{c}/groups",
        json={"name": "GA"},
        headers=teacher_headers,
    )
    gid = g.json()["id"]
    r = await client.post(
        f"/api/v1/courses/{c}/groups/{gid}/members",
        json={"user_id": "usr_g1"},
        headers=teacher_headers,
    )
    assert r.status_code == 201
    rl = await client.get(
        f"/api/v1/courses/{c}/groups/{gid}/members", headers=teacher_headers
    )
    assert rl.status_code == 200
    assert any(m["user_id"] == "usr_g1" for m in rl.json())
    rd = await client.delete(
        f"/api/v1/courses/{c}/groups/{gid}/members/usr_g1",
        headers=teacher_headers,
    )
    assert rd.status_code == 204


async def test_batch_add_group_members(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    g = await client.post(
        f"/api/v1/courses/{c}/groups", json={"name": "Bx"}, headers=teacher_headers
    )
    gid = g.json()["id"]
    r = await client.post(
        f"/api/v1/courses/{c}/groups/{gid}/members:batchCreate",
        json=[{"user_id": "u1"}, {"user_id": "u2"}, {"user_id": "u3"}],
        headers=teacher_headers,
    )
    assert r.status_code == 201
    assert len(r.json()) == 3


async def test_delete_group(client, teacher_headers):
    c = await _create_course(client, teacher_headers)
    r = await client.post(
        f"/api/v1/courses/{c}/groups", json={"name": "DG"}, headers=teacher_headers
    )
    gid = r.json()["id"]
    rd = await client.delete(
        f"/api/v1/courses/{c}/groups/{gid}", headers=teacher_headers
    )
    assert rd.status_code == 204
    rg = await client.get(
        f"/api/v1/courses/{c}/groups/{gid}", headers=teacher_headers
    )
    assert rg.status_code == 404
