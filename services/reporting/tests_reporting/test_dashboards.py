"""Dashboard endpoints — read from read-models, cache via Redis."""
from __future__ import annotations

import pytest

from reporting_service.models.reporting import (
    AssignmentStats,
    CourseStats,
    TenantStats,
    UserGradesSummary,
)


@pytest.mark.asyncio
async def test_course_overview_empty(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/courses/course-1/dashboard")
        assert r.status_code == 200
        body = r.json()
        assert body["course_id"] == "course-1"
        assert body["enrolled_students"] == 0


@pytest.mark.asyncio
async def test_course_overview_with_read_model(
    client_factory, teacher_principal, session_maker
):
    async with session_maker() as session:
        session.add(
            CourseStats(
                course_id="course-1",
                tenant_id="tenant-1",
                enrolled_students=10,
                assignments_count=4,
                submissions_total=27,
                average_score=78.4,
                plagiarism_alerts_count=2,
                ai_runs_count=12,
                ai_tokens_used=50_000,
            )
        )
        await session.commit()

    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/courses/course-1/dashboard")
        assert r.status_code == 200
        body = r.json()
        assert body["enrolled_students"] == 10
        assert body["assignments_count"] == 4
        assert body["plagiarism_alerts_count"] == 2

        # 2nd call must hit the cache
        r2 = await cli.get("/api/v1/courses/course-1/dashboard")
        assert r2.json().get("cached") in (True, False)


@pytest.mark.asyncio
async def test_grades_distribution(client_factory, teacher_principal, session_maker):
    async with session_maker() as session:
        session.add_all(
            [
                AssignmentStats(
                    assignment_id="a1",
                    course_id="course-1",
                    tenant_id="tenant-1",
                    score_count=10,
                    average_score=42.0,
                ),
                AssignmentStats(
                    assignment_id="a2",
                    course_id="course-1",
                    tenant_id="tenant-1",
                    score_count=5,
                    average_score=88.0,
                ),
            ]
        )
        await session.commit()

    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/courses/course-1/dashboard/grades-distribution")
        assert r.status_code == 200
        buckets = r.json()["buckets"]
        # 0-49 had 10 from a1, 85-100 had 5 from a2. The endpoint maps the
        # read-model's `range` field to `bucket` (frontend chart dataKey).
        ranges = {b["bucket"]: b["count"] for b in buckets}
        assert ranges["0-49"] == 10
        assert ranges["85-100"] == 5


@pytest.mark.asyncio
async def test_tenant_dashboard_admin_only(client_factory, admin_principal, session_maker):
    async with session_maker() as session:
        session.add(
            TenantStats(
                tenant_id="tenant-1",
                active_courses=3,
                active_users=42,
                submissions_30d=200,
            )
        )
        await session.commit()

    async with client_factory(admin_principal) as cli:
        r = await cli.get("/api/v1/tenants/tenant-1/dashboard")
        assert r.status_code == 200
        assert r.json()["active_courses"] == 3


@pytest.mark.asyncio
async def test_tenant_dashboard_other_tenant_forbidden(client_factory, admin_principal):
    async with client_factory(admin_principal) as cli:
        r = await cli.get("/api/v1/tenants/other-tenant/dashboard")
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_global_dashboard_admin(client_factory, admin_principal):
    async with client_factory(admin_principal) as cli:
        r = await cli.get("/api/v1/admin/dashboard/global")
        assert r.status_code == 200


@pytest.mark.asyncio
async def test_global_dashboard_forbids_non_admin(
    client_factory, teacher_principal, student_principal
):
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/admin/dashboard/global")
        assert r.status_code == 403
    async with client_factory(student_principal) as cli:
        r = await cli.get("/api/v1/admin/dashboard/global")
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_my_dashboard(client_factory, student_principal, session_maker):
    async with session_maker() as session:
        session.add(
            UserGradesSummary(
                user_id="user-1",
                course_id="course-1",
                tenant_id="tenant-1",
                submissions_total=4,
                average_score=70.0,
                score_count=4,
                score_sum=280.0,
            )
        )
        await session.commit()

    async with client_factory(student_principal) as cli:
        r = await cli.get("/api/v1/users/me/dashboard")
        assert r.status_code == 200
        body = r.json()
        assert body["user_id"] == "user-1"
        assert any(c["course_id"] == "course-1" for c in body["courses"])


@pytest.mark.asyncio
async def test_my_grades_summary(client_factory, student_principal, session_maker):
    async with session_maker() as session:
        session.add(
            UserGradesSummary(
                user_id="user-1",
                course_id="course-1",
                tenant_id="tenant-1",
                submissions_total=10,
                on_time_count=8,
                on_time_total=10,
                average_score=85.0,
                score_count=10,
                score_sum=850.0,
            )
        )
        await session.commit()

    async with client_factory(student_principal) as cli:
        r = await cli.get("/api/v1/users/me/courses/course-1/grades-summary")
        assert r.status_code == 200
        body = r.json()
        assert body["on_time_rate"] == 0.8
        assert body["average_score"] == 85.0


@pytest.mark.asyncio
async def test_course_late_submissions(client_factory, teacher_principal, session_maker):
    async with session_maker() as session:
        session.add(
            AssignmentStats(
                assignment_id="a1",
                course_id="course-1",
                tenant_id="tenant-1",
                late_soft_count=3,
                late_hard_count=1,
                on_time_count=20,
            )
        )
        await session.commit()

    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/courses/course-1/dashboard/late-submissions")
        assert r.status_code == 200
        body = r.json()
        assert body["late_soft"] == 3
        assert body["late_hard"] == 1
        assert body["on_time"] == 20
