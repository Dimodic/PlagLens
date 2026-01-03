"""Scheduled exports CRUD + idempotent firing."""
from __future__ import annotations

from datetime import timedelta

import pytest

from reporting_service.common.time import utcnow


@pytest.mark.asyncio
async def test_create_list_get_update_delete_schedule(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        # Create
        cr = await cli.post(
            "/api/v1/courses/course-1/scheduled-exports",
            json={
                "kind": "course_summary",
                "format": "csv",
                "cron": "@daily",
                "scope": {"course_id": "course-1"},
            },
        )
        assert cr.status_code == 201
        sched = cr.json()
        sched_id = sched["id"]

        # List
        lst = await cli.get("/api/v1/courses/course-1/scheduled-exports")
        assert lst.status_code == 200
        assert any(s["id"] == sched_id for s in lst.json()["data"])

        # Get
        g = await cli.get(f"/api/v1/courses/course-1/scheduled-exports/{sched_id}")
        assert g.status_code == 200
        assert g.json()["cron"] == "@daily"

        # Patch
        p = await cli.patch(
            f"/api/v1/courses/course-1/scheduled-exports/{sched_id}",
            json={"enabled": False},
        )
        assert p.status_code == 200
        assert p.json()["enabled"] is False

        # Delete
        d = await cli.delete(f"/api/v1/courses/course-1/scheduled-exports/{sched_id}")
        assert d.status_code == 204
        # Re-fetch is 404 (soft-deleted)
        g2 = await cli.get(f"/api/v1/courses/course-1/scheduled-exports/{sched_id}")
        assert g2.status_code == 404


@pytest.mark.asyncio
async def test_schedule_run_now(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        cr = await cli.post(
            "/api/v1/courses/course-1/scheduled-exports",
            json={
                "kind": "course_summary",
                "format": "json",
                "cron": "@hourly",
                "scope": {"course_id": "course-1"},
            },
        )
        sched_id = cr.json()["id"]
        rn = await cli.post(
            f"/api/v1/courses/course-1/scheduled-exports/{sched_id}:run-now"
        )
        assert rn.status_code == 202
        assert rn.json()["operation_id"].startswith("op_")


@pytest.mark.asyncio
async def test_scheduler_idempotency_per_period(scheduler, session_maker):
    """Calling trigger_due twice for the same period must not double-fire."""
    from reporting_service.models.reporting import ScheduledExport

    now = utcnow()
    async with session_maker() as s:
        sched = ScheduledExport(
            id="sch_test",
            tenant_id="tenant-1",
            course_id="course-1",
            kind="course_summary",
            fmt="json",
            target="file_download",
            cron="every:60s",
            scope={"course_id": "course-1"},
            enabled=True,
            created_by="user-1",
            created_at=now,
            next_run_at=now - timedelta(seconds=10),
        )
        s.add(sched)
        await s.commit()

    fired_1 = await scheduler.trigger_due(now=now)
    fired_2 = await scheduler.trigger_due(now=now)
    assert len(fired_1) == 1
    assert len(fired_2) == 0  # idempotent


@pytest.mark.asyncio
async def test_next_run_at_simple_cron():
    from reporting_service.scheduling.scheduler import ReportingScheduler

    now = utcnow()
    n_hourly = ReportingScheduler._next_run_at("@hourly", now)
    n_daily = ReportingScheduler._next_run_at("@daily", now)
    n_every = ReportingScheduler._next_run_at("every:300s", now)
    assert n_hourly > now
    assert n_daily > now
    assert n_every == now + timedelta(seconds=300)
