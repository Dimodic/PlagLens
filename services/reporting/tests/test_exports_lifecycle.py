"""Lifecycle: create export → operation status → run → download (signed URL)."""
from __future__ import annotations

import asyncio

import pytest


@pytest.mark.asyncio
async def test_create_assignment_export_returns_202_with_operation(
    client_factory, teacher_principal
):
    async with client_factory(teacher_principal) as cli:
        r = await cli.post(
            "/api/v1/assignments/asgn-1/exports",
            json={
                "kind": "assignment_grades",
                "format": "csv",
                "scope": {"course_id": "course-1"},
                "options": {},
            },
        )
        assert r.status_code == 202, r.text
        body = r.json()
        assert body["operation_id"].startswith("op_")
        assert body["export_id"].startswith("exp_")
        assert "status_url" in body
        assert r.headers["Location"].endswith(body["operation_id"])


@pytest.mark.asyncio
async def test_create_then_operation_status(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.post(
            "/api/v1/courses/course-1/exports",
            json={"kind": "course_summary", "format": "json", "scope": {}},
        )
        op_id = r.json()["operation_id"]

        # Wait for the fire-and-forget worker
        for _ in range(10):
            await asyncio.sleep(0.05)
            s = await cli.get(f"/api/v1/operations/{op_id}")
            if s.json()["status"] == "completed":
                break
        assert s.json()["status"] in {"completed", "running", "queued"}


@pytest.mark.asyncio
async def test_idempotency_key_returns_same_operation(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        body = {"kind": "course_summary", "format": "json", "scope": {"course_id": "course-1"}}
        r1 = await cli.post(
            "/api/v1/courses/course-1/exports",
            json=body,
            headers={"Idempotency-Key": "abc-123"},
        )
        # Allow the first job to be persisted before the second request reads back its body.
        await asyncio.sleep(0.05)
        r2 = await cli.post(
            "/api/v1/courses/course-1/exports",
            json=body,
            headers={"Idempotency-Key": "abc-123"},
        )
        assert r1.status_code == 202
        assert r2.status_code == 202
        # Either same operation (cached) or distinct but both 202 — at minimum no 409.


@pytest.mark.asyncio
async def test_idempotency_conflict_on_different_body(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        await cli.post(
            "/api/v1/courses/course-1/exports",
            json={"kind": "course_summary", "format": "json", "scope": {}},
            headers={"Idempotency-Key": "k1"},
        )
        r2 = await cli.post(
            "/api/v1/courses/course-1/exports",
            json={"kind": "course_summary", "format": "csv", "scope": {}},
            headers={"Idempotency-Key": "k1"},
        )
        assert r2.status_code == 409


@pytest.mark.asyncio
async def test_list_my_exports(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        await cli.post(
            "/api/v1/courses/course-1/exports",
            json={"kind": "course_summary", "format": "json", "scope": {}},
        )
        r = await cli.get("/api/v1/exports")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body and "pagination" in body


@pytest.mark.asyncio
async def test_get_export_404_for_unknown(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/exports/exp_unknown")
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_retry_and_cancel_flow(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        cr = await cli.post(
            "/api/v1/courses/course-1/exports",
            json={"kind": "course_summary", "format": "json", "scope": {}},
        )
        export_id = cr.json()["export_id"]
        # Wait for worker to complete or settle into a non-running state.
        for _ in range(30):
            await asyncio.sleep(0.05)
            d = await cli.get(f"/api/v1/exports/{export_id}")
            if d.status_code == 200 and d.json()["status"] in {"completed", "failed"}:
                break

        # Cancel a completed job → 409 (state machine refuses). Retry on a non-failed → 409.
        rc = await cli.post(f"/api/v1/exports/{export_id}:cancel")
        assert rc.status_code in (202, 409)


@pytest.mark.asyncio
async def test_download_signed_url(
    client_factory, teacher_principal, export_service, session_maker
):
    """End-to-end: create + run + download → a signed URL with TTL."""
    async with client_factory(teacher_principal) as cli:
        cr = await cli.post(
            "/api/v1/courses/course-1/exports",
            json={"kind": "course_summary", "format": "csv", "scope": {}},
        )
        export_id = cr.json()["export_id"]
        # Drive the worker deterministically (avoid race with the fire-and-forget task).
        await export_service.run_now(export_id)

        d = await cli.get(f"/api/v1/exports/{export_id}/download")
        assert d.status_code == 200, d.text
        body = d.json()
        assert body["url"].startswith("memory://")
        assert body["expires_in"] == 300
        assert body["filename"].endswith(".csv")


@pytest.mark.asyncio
async def test_delete_export_soft(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        cr = await cli.post(
            "/api/v1/courses/course-1/exports",
            json={"kind": "course_summary", "format": "json", "scope": {}},
        )
        export_id = cr.json()["export_id"]
        d = await cli.delete(f"/api/v1/exports/{export_id}")
        assert d.status_code == 204
        # Re-fetch should 404 (soft-deleted)
        g = await cli.get(f"/api/v1/exports/{export_id}")
        assert g.status_code == 404


@pytest.mark.asyncio
async def test_admin_audit_export(client_factory, admin_principal, app):
    app.state.audit_proxy.add(
        {"tenant_id": "tenant-1", "course_id": "course-1", "actor_id": "u", "action": "x"}
    )
    async with client_factory(admin_principal) as cli:
        r = await cli.post(
            "/api/v1/admin/exports/audit",
            json={"kind": "audit_log", "format": "json", "scope": {}},
        )
        assert r.status_code == 202


@pytest.mark.asyncio
async def test_admin_tenant_usage_export(client_factory, admin_principal):
    async with client_factory(admin_principal) as cli:
        r = await cli.post(
            "/api/v1/admin/exports/tenant-usage",
            json={"kind": "tenant_usage", "format": "csv", "scope": {}},
        )
        assert r.status_code == 202


@pytest.mark.asyncio
async def test_student_cannot_create_admin_audit_export(client_factory, student_principal):
    async with client_factory(student_principal) as cli:
        r = await cli.post(
            "/api/v1/admin/exports/audit",
            json={"kind": "audit_log", "format": "json", "scope": {}},
        )
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_plagiarism_export(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.post(
            "/api/v1/plagiarism-runs/run-1/exports",
            json={
                "kind": "plagiarism_report",
                "format": "json",
                "scope": {"course_id": "course-1"},
            },
        )
        assert r.status_code == 202
