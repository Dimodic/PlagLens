"""Read-model handlers: idempotency, course/assignment/tenant/user roll-ups."""
from __future__ import annotations

import pytest

from reporting_service.models.reporting import (
    AssignmentStats,
    CourseStats,
    ReadModelHealth,
    TenantStats,
    UserGradesSummary,
)


def _envelope(evt_type: str, tenant: str = "tenant-1", evt_id: str | None = None, **data):
    return {
        "specversion": "1.0",
        "id": evt_id or f"evt_{evt_type}",
        "type": evt_type,
        "source": "/test",
        "tenant_id": tenant,
        "subject": "x",
        "data": data,
        "time": "2026-05-01T00:00:00Z",
    }


@pytest.mark.asyncio
async def test_course_created_increments_active_courses(consumer, session_maker):
    await consumer.ingest(
        _envelope("course.course.created.v1", course_id="course-A")
    )
    async with session_maker() as s:
        cs = await s.get(CourseStats, "course-A")
        t = await s.get(TenantStats, "tenant-1")
    assert cs is not None
    assert t.active_courses == 1


@pytest.mark.asyncio
async def test_idempotent_double_delivery(consumer, session_maker):
    env = _envelope("course.course.created.v1", evt_id="evt_dup", course_id="course-B")
    await consumer.ingest(env)
    await consumer.ingest(env)  # should be no-op
    async with session_maker() as s:
        t = await s.get(TenantStats, "tenant-1")
    assert t.active_courses == 1  # incremented exactly once


@pytest.mark.asyncio
async def test_submission_created_aggregates(consumer, session_maker):
    await consumer.ingest(
        _envelope(
            "submission.submission.created.v1",
            assignment_id="a1",
            course_id="course-C",
            author_id="user-X",
            on_time=True,
        )
    )
    async with session_maker() as s:
        a = await s.get(AssignmentStats, "a1")
        cs = await s.get(CourseStats, "course-C")
        ug = await s.get(UserGradesSummary, ("user-X", "course-C"))
    assert a.submissions_count == 1
    assert a.on_time_count == 1
    assert cs.submissions_total == 1
    assert ug.submissions_total == 1
    assert ug.on_time_count == 1


@pytest.mark.asyncio
async def test_grade_assigned_updates_avg(consumer, session_maker):
    await consumer.ingest(
        _envelope(
            "submission.grade.assigned.v1",
            assignment_id="a2",
            course_id="course-D",
            author_id="user-X",
            score=80.0,
        )
    )
    await consumer.ingest(
        _envelope(
            "submission.grade.assigned.v1",
            evt_id="evt_2",
            assignment_id="a2",
            course_id="course-D",
            author_id="user-X",
            score=60.0,
        )
    )
    async with session_maker() as s:
        a = await s.get(AssignmentStats, "a2")
    assert a.score_count == 2
    assert a.average_score == 70.0


@pytest.mark.asyncio
async def test_plagiarism_run_completed(consumer, session_maker):
    await consumer.ingest(
        _envelope(
            "plagiarism.run.completed.v1",
            course_id="course-E",
            assignment_id="a3",
            alerts_count=2,
            max_similarity=0.91,
        )
    )
    async with session_maker() as s:
        a = await s.get(AssignmentStats, "a3")
        cs = await s.get(CourseStats, "course-E")
        t = await s.get(TenantStats, "tenant-1")
    assert a.max_similarity == 0.91
    assert cs.plagiarism_alerts_count == 2
    assert t.plagiarism_runs_30d == 1


@pytest.mark.asyncio
async def test_ai_completed(consumer, session_maker):
    await consumer.ingest(
        _envelope(
            "ai.analysis.completed.v1",
            course_id="course-F",
            assignment_id="a4",
            tokens=1200,
            cost_usd=0.06,
        )
    )
    async with session_maker() as s:
        cs = await s.get(CourseStats, "course-F")
        t = await s.get(TenantStats, "tenant-1")
    assert cs.ai_runs_count == 1
    assert cs.ai_tokens_used == 1200
    assert t.ai_tokens_total_30d == 1200


@pytest.mark.asyncio
async def test_unknown_event_recorded_but_not_dispatched(consumer, session_maker):
    ok = await consumer.ingest(_envelope("unknown.event.v1"))
    # Should return False (unknown), but mark the event_id processed.
    assert ok is False


@pytest.mark.asyncio
async def test_health_lag_tracked(consumer, session_maker):
    await consumer.ingest(_envelope("course.course.created.v1", course_id="course-Z"))
    async with session_maker() as s:
        h = await s.get(ReadModelHealth, "course")
    assert h is not None


@pytest.mark.asyncio
async def test_user_anonymized_renames(consumer, session_maker):
    await consumer.ingest(
        _envelope(
            "submission.submission.created.v1",
            evt_id="e_sub",
            assignment_id="a-anon",
            course_id="course-anon",
            author_id="user-secret",
        )
    )
    await consumer.ingest(
        _envelope("identity.user.anonymized.v1", evt_id="e_anon", user_id="user-secret")
    )
    async with session_maker() as s:
        from sqlalchemy import select

        rows = (await s.execute(select(UserGradesSummary))).scalars().all()
    user_ids = [r.user_id for r in rows]
    assert any(uid.startswith("anon_") for uid in user_ids)
