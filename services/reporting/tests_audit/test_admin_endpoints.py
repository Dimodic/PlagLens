from __future__ import annotations

import pytest

HEADERS = {"X-Test-Tenant-Id": "tnt_test", "X-Test-Role": "admin"}


@pytest.mark.asyncio
async def test_retention_policy_get_and_patch(client):
    r = await client.get("/api/v1/admin/audit/retention-policy", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["default_retention_days"] == 365

    r = await client.patch(
        "/api/v1/admin/audit/retention-policy",
        json={"default_retention_days": 180},
        headers=HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["default_retention_days"] == 180


@pytest.mark.asyncio
async def test_retention_status(client):
    r = await client.get("/api/v1/admin/audit/retention-status", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["pending_cleanup_partitions"] == []


@pytest.mark.asyncio
async def test_retention_run_now_requires_super_admin(client):
    r = await client.post("/api/v1/admin/audit/retention:run-now", headers=HEADERS)
    assert r.status_code == 403

    super_hdrs = {**HEADERS, "X-Test-Role": "super_admin"}
    r = await client.post(
        "/api/v1/admin/audit/retention:run-now", headers=super_hdrs
    )
    assert r.status_code == 200
    assert r.json()["dry_run"] is False


@pytest.mark.asyncio
async def test_stats_zero_rows(client):
    r = await client.get("/api/v1/admin/audit/stats", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["total_events"] == 0
    assert body["error_rate"] == 0.0


@pytest.mark.asyncio
async def test_export_proxy_returns_op_handle(client):
    r = await client.post(
        "/api/v1/audit/events:export",
        json={"format": "csv", "filters": {"action": "auth.login_success"}},
        headers=HEADERS,
    )
    assert r.status_code == 202
    body = r.json()
    assert body["operation_id"].startswith("op_") or body["operation_id"]
    assert body["status_url"]


@pytest.mark.asyncio
async def test_timeline_endpoint(client):
    r = await client.get("/api/v1/audit/timeline", headers=HEADERS)
    assert r.status_code == 200
    assert "data" in r.json()


@pytest.mark.asyncio
async def test_course_audit_requires_role(client):
    student_hdrs = {
        "X-Test-Tenant-Id": "tnt_test",
        "X-Test-Role": "student",
        "X-Test-User-Id": "usr_student",
    }
    r = await client.get("/api/v1/courses/crs_1/audit", headers=student_hdrs)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_user_audit_self_or_admin(client):
    self_hdrs = {
        "X-Test-Tenant-Id": "tnt_test",
        "X-Test-Role": "student",
        "X-Test-User-Id": "usr_42",
    }
    r = await client.get("/api/v1/users/usr_42/audit", headers=self_hdrs)
    assert r.status_code == 200
    r = await client.get("/api/v1/users/usr_999/audit", headers=self_hdrs)
    assert r.status_code == 403
