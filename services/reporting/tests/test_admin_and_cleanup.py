"""Admin endpoints (read-models rebuild, audit proxy) + cleanup task."""
from __future__ import annotations

from datetime import timedelta

import pytest

from reporting_service.common.time import utcnow
from reporting_service.models.reporting import CourseStats, ExportJob


@pytest.mark.asyncio
async def test_read_models_rebuild_all(client_factory, admin_principal, session_maker):
    async with session_maker() as s:
        s.add(CourseStats(course_id="cR", tenant_id="tenant-1", submissions_total=5))
        await s.commit()
    async with client_factory(admin_principal) as cli:
        r = await cli.post("/api/v1/admin/reporting/read-models:rebuild")
        assert r.status_code == 202
        assert r.json()["status"] == "rebuilt"


@pytest.mark.asyncio
async def test_read_models_rebuild_one(client_factory, admin_principal):
    async with client_factory(admin_principal) as cli:
        r = await cli.post("/api/v1/admin/reporting/read-models/course_stats:rebuild")
        assert r.status_code == 202


@pytest.mark.asyncio
async def test_read_models_health(client_factory, admin_principal):
    async with client_factory(admin_principal) as cli:
        r = await cli.get("/api/v1/admin/reporting/read-models/health")
        assert r.status_code == 200
        assert "data" in r.json()


@pytest.mark.asyncio
async def test_recent_activity_proxy(client_factory, teacher_principal, app):
    app.state.audit_proxy.add(
        {"tenant_id": "tenant-1", "course_id": "course-1", "actor_id": "user-1", "action": "view"}
    )
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/courses/course-1/recent-activity")
        assert r.status_code == 200
        assert len(r.json()["data"]) == 1


@pytest.mark.asyncio
async def test_my_recent_activity(client_factory, teacher_principal, app):
    app.state.audit_proxy.add(
        {"tenant_id": "tenant-1", "actor_id": "user-1", "action": "login"}
    )
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/users/me/recent-activity")
        assert r.status_code == 200
        assert any(e.get("action") == "login" for e in r.json()["data"])


@pytest.mark.asyncio
async def test_cleanup_drops_expired_artifacts(session_maker, storage):
    """Daily cleanup removes MinIO blobs whose ExportJob.expiry_at is past."""
    from reporting_service.services.cleanup import run_cleanup

    now = utcnow()
    bucket = "plaglens-tenant-1"
    await storage.put(bucket, "exports/2026/04/exp_old/file.csv", b"data", "text/csv")

    async with session_maker() as s:
        s.add(
            ExportJob(
                id="exp_old",
                operation_id="op_old",
                tenant_id="tenant-1",
                kind="course_summary",
                scope={"course_id": "course-1"},
                fmt="csv",
                options={},
                status="completed",
                triggered_by="user-1",
                artifact_uri=f"s3://{bucket}/exports/2026/04/exp_old/file.csv",
                artifact_filename="file.csv",
                artifact_size_bytes=4,
                expiry_at=now - timedelta(days=1),
            )
        )
        await s.commit()

    res = await run_cleanup(session_maker, storage, now=now)
    assert res["deleted_artifacts"] == 1
    assert "exp_old" in res["expired_export_ids"]
