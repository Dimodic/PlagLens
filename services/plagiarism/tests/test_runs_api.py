"""Tests for §A — runs CRUD."""
from __future__ import annotations

from tests.conftest import admin_headers, teacher_headers


async def test_create_run_returns_202(client):
    resp = await client.post(
        "/api/v1/assignments/asn_42/plagiarism-runs",
        json={"provider": "dolos", "with_corpus": False, "options": {"min_tokens": 9}},
        headers={**teacher_headers(course_id="crs_a"), "Idempotency-Key": "idem-1"},
        params={"course_id": "crs_a"},
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["operation_id"].startswith("plg_")
    assert body["status_url"].endswith(body["operation_id"])


async def test_idempotency_replay_returns_same_run(client):
    headers = {**teacher_headers(course_id="crs_a"), "Idempotency-Key": "idem-2"}
    body = {"provider": "dolos", "options": {"min_tokens": 9}}
    r1 = await client.post(
        "/api/v1/assignments/asn_42/plagiarism-runs",
        json=body, headers=headers, params={"course_id": "crs_a"},
    )
    r2 = await client.post(
        "/api/v1/assignments/asn_42/plagiarism-runs",
        json=body, headers=headers, params={"course_id": "crs_a"},
    )
    assert r1.status_code == 202
    assert r2.status_code == 202
    assert r1.json()["operation_id"] == r2.json()["operation_id"]


async def test_idempotency_conflict_on_different_body(client):
    headers = {**teacher_headers(course_id="crs_a"), "Idempotency-Key": "idem-3"}
    r1 = await client.post(
        "/api/v1/assignments/asn_42/plagiarism-runs",
        json={"provider": "dolos", "options": {"min_tokens": 9}},
        headers=headers,
        params={"course_id": "crs_a"},
    )
    assert r1.status_code == 202
    r2 = await client.post(
        "/api/v1/assignments/asn_42/plagiarism-runs",
        json={"provider": "moss", "options": {"min_tokens": 5}},
        headers=headers,
        params={"course_id": "crs_a"},
    )
    assert r2.status_code == 409


async def test_list_runs_by_assignment(client):
    headers = teacher_headers(course_id="crs_b")
    await client.post(
        "/api/v1/assignments/asn_55/plagiarism-runs",
        json={"provider": "dolos"},
        headers=headers,
        params={"course_id": "crs_b"},
    )
    resp = await client.get(
        "/api/v1/assignments/asn_55/plagiarism-runs",
        headers=headers,
        params={"course_id": "crs_b"},
    )
    assert resp.status_code == 200
    assert "data" in resp.json()


async def test_get_run_detail_404(client):
    headers = teacher_headers(course_id="crs_b")
    resp = await client.get(
        "/api/v1/plagiarism-runs/plg_does_not_exist",
        headers=headers,
    )
    assert resp.status_code == 404


async def test_cancel_unknown_run(client):
    resp = await client.post(
        "/api/v1/plagiarism-runs/plg_x:cancel", headers=admin_headers()
    )
    assert resp.status_code == 404


async def test_retry_only_failed(client):
    headers = teacher_headers(course_id="crs_c")
    r = await client.post(
        "/api/v1/assignments/asn_60/plagiarism-runs",
        json={"provider": "dolos"},
        headers=headers,
        params={"course_id": "crs_c"},
    )
    rid = r.json()["operation_id"]
    resp = await client.post(
        f"/api/v1/plagiarism-runs/{rid}:retry", headers=headers
    )
    assert resp.status_code == 409
