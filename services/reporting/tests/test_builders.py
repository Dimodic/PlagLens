"""Builder dispatch + per-builder dataset shape."""
from __future__ import annotations

import pytest

from reporting_service.exports.builders.base import build_dataset
from reporting_service.models.reporting import (
    AssignmentStats,
    CourseStats,
    TenantStats,
    UserGradesSummary,
)


@pytest.mark.asyncio
async def test_assignment_grades_builder(session):
    session.add_all(
        [
            UserGradesSummary(
                user_id="u1",
                course_id="course-1",
                tenant_id="tenant-1",
                submissions_total=5,
                average_score=80.0,
                score_count=5,
                score_sum=400.0,
                on_time_count=4,
                on_time_total=5,
                suspicious_count=1,
            )
        ]
    )
    await session.commit()
    res = await build_dataset(
        "assignment_grades",
        session,
        scope={"course_id": "course-1"},
        options={},
    )
    assert res.title == "Course Grades"
    assert any(r["user_id"] == "u1" for r in res.rows)


@pytest.mark.asyncio
async def test_course_summary_builder(session):
    session.add(
        CourseStats(
            course_id="course-2",
            tenant_id="tenant-1",
            submissions_total=10,
            assignments_count=3,
        )
    )
    session.add(
        AssignmentStats(
            assignment_id="a1",
            course_id="course-2",
            tenant_id="tenant-1",
            submissions_count=8,
            average_score=70.0,
        )
    )
    await session.commit()
    res = await build_dataset(
        "course_summary",
        session,
        scope={"course_id": "course-2"},
        options={},
    )
    assert res.title == "Course Summary"
    assert len(res.rows) >= 2


@pytest.mark.asyncio
async def test_plagiarism_report_builder(session):
    session.add(
        AssignmentStats(
            assignment_id="ap1",
            course_id="course-3",
            tenant_id="tenant-1",
            submissions_count=20,
            max_similarity=0.92,
            suspicious_count=3,
        )
    )
    await session.commit()
    res = await build_dataset(
        "plagiarism_report",
        session,
        scope={"course_id": "course-3"},
        options={},
    )
    assert res.title == "Plagiarism Report"
    assert any(f["level"] == "danger" for f in res.cell_flags)


@pytest.mark.asyncio
async def test_ai_analysis_summary_builder(session):
    session.add(
        CourseStats(
            course_id="course-ai",
            tenant_id="tenant-1",
            ai_runs_count=5,
            ai_tokens_used=12345,
        )
    )
    await session.commit()
    res = await build_dataset(
        "ai_analysis_summary",
        session,
        scope={"course_id": "course-ai"},
        options={},
    )
    assert res.title == "AI Analysis Summary"
    assert any(r["scope_id"] == "course-ai" for r in res.rows)


@pytest.mark.asyncio
async def test_audit_log_builder(session):
    res = await build_dataset(
        "audit_log",
        session,
        scope={"entries": [{"timestamp": "t1", "actor": "u", "action": "x"}]},
        options={},
    )
    assert res.title == "Audit Log"
    assert len(res.rows) == 1


@pytest.mark.asyncio
async def test_tenant_usage_builder(session):
    session.add(
        TenantStats(
            tenant_id="tenant-1",
            active_courses=3,
            ai_tokens_total_30d=99,
            ai_cost_total_30d=1.23,
        )
    )
    await session.commit()
    res = await build_dataset(
        "tenant_usage",
        session,
        scope={"tenant_id": "tenant-1"},
        options={},
    )
    assert res.title == "Tenant Usage"
    assert res.rows[0]["active_courses"] == 3


@pytest.mark.asyncio
async def test_unknown_kind_raises(session):
    with pytest.raises(ValueError):
        await build_dataset("not-a-kind", session, scope={}, options={})
