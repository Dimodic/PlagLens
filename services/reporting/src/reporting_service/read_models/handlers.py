"""Idempotent handlers for CloudEvents that update read-model tables.

Per 11-REPORTING.md §"События, на которые подписан Reporting Service" + 03-EVENTS.md.
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.time import utcnow
from ..models.reporting import (
    AssignmentStats,
    CourseStats,
    TenantStats,
    UserGradesSummary,
)

HandlerFn = Callable[[AsyncSession, dict[str, Any]], Awaitable[None]]

_COURSE_DEFAULTS = dict(
    enrolled_students=0,
    assignments_count=0,
    submissions_total=0,
    average_score=0.0,
    plagiarism_alerts_count=0,
    ai_runs_count=0,
    ai_tokens_used=0,
    archived=False,
)
_ASSIGNMENT_DEFAULTS = dict(
    submissions_count=0,
    students_submitted_count=0,
    on_time_count=0,
    late_soft_count=0,
    late_hard_count=0,
    average_score=0.0,
    score_sum=0.0,
    score_count=0,
    max_similarity=0.0,
    suspicious_count=0,
    ai_completed_count=0,
)
_TENANT_DEFAULTS = dict(
    active_courses=0,
    active_users=0,
    submissions_30d=0,
    ai_tokens_total_30d=0,
    ai_cost_total_30d=0.0,
    plagiarism_runs_30d=0,
)
_UG_DEFAULTS = dict(
    assignments_total=0,
    submissions_total=0,
    average_score=0.0,
    score_sum=0.0,
    score_count=0,
    on_time_count=0,
    on_time_total=0,
    suspicious_count=0,
)

async def _course(session: AsyncSession, course_id: str, tenant_id: str) -> CourseStats:
    obj = await session.get(CourseStats, course_id)
    if obj is None:
        obj = CourseStats(course_id=course_id, tenant_id=tenant_id, **_COURSE_DEFAULTS)
        session.add(obj)
    return obj

async def _assignment(
    session: AsyncSession, assignment_id: str, course_id: str, tenant_id: str
) -> AssignmentStats:
    obj = await session.get(AssignmentStats, assignment_id)
    if obj is None:
        obj = AssignmentStats(
            assignment_id=assignment_id,
            course_id=course_id,
            tenant_id=tenant_id,
            **_ASSIGNMENT_DEFAULTS,
        )
        session.add(obj)
    return obj

async def _tenant(session: AsyncSession, tenant_id: str) -> TenantStats:
    obj = await session.get(TenantStats, tenant_id)
    if obj is None:
        obj = TenantStats(tenant_id=tenant_id, **_TENANT_DEFAULTS)
        session.add(obj)
    return obj

async def _ugrades(
    session: AsyncSession, user_id: str, course_id: str, tenant_id: str
) -> UserGradesSummary:
    obj = await session.get(UserGradesSummary, (user_id, course_id))
    if obj is None:
        obj = UserGradesSummary(
            user_id=user_id, course_id=course_id, tenant_id=tenant_id, **_UG_DEFAULTS
        )
        session.add(obj)
    return obj

async def on_course_created(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    course_id = str(data.get("course_id", ""))
    if not course_id:
        return
    await _course(session, course_id, tenant_id)
    t = await _tenant(session, tenant_id)
    t.active_courses = (t.active_courses or 0) + 1
    t.updated_at = utcnow()

async def on_course_archived(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    course_id = str(data.get("course_id", ""))
    if not course_id:
        return
    cs = await _course(session, course_id, tenant_id)
    cs.archived = True
    t = await _tenant(session, tenant_id)
    t.active_courses = max(0, (t.active_courses or 0) - 1)
    t.updated_at = utcnow()

async def on_assignment_created(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    course_id = str(data.get("course_id", ""))
    assignment_id = str(data.get("assignment_id", ""))
    if not assignment_id or not course_id:
        return
    await _assignment(session, assignment_id, course_id, tenant_id)
    cs = await _course(session, course_id, tenant_id)
    cs.assignments_count = (cs.assignments_count or 0) + 1
    cs.last_activity_at = utcnow()
    cs.updated_at = utcnow()

async def on_submission_created(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    assignment_id = str(data.get("assignment_id", ""))
    course_id = str(data.get("course_id", ""))
    user_id = str(data.get("author_id", "")) or str(data.get("user_id", ""))
    on_time = bool(data.get("on_time", True))
    late = data.get("late_kind") or ("none" if on_time else "soft")
    if not assignment_id:
        return
    a = await _assignment(session, assignment_id, course_id or "?", tenant_id)
    a.submissions_count += 1
    if late == "soft":
        a.late_soft_count += 1
    elif late == "hard":
        a.late_hard_count += 1
    else:
        a.on_time_count += 1
    a.updated_at = utcnow()
    if course_id:
        cs = await _course(session, course_id, tenant_id)
        cs.submissions_total += 1
        cs.last_activity_at = utcnow()
        cs.updated_at = utcnow()
    if user_id and course_id:
        ug = await _ugrades(session, user_id, course_id, tenant_id)
        ug.submissions_total += 1
        ug.on_time_total += 1
        if late == "none":
            ug.on_time_count += 1
        ug.last_activity_at = utcnow()
        ug.updated_at = utcnow()
    t = await _tenant(session, tenant_id)
    t.submissions_30d += 1
    t.updated_at = utcnow()

async def on_grade_assigned(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    assignment_id = str(data.get("assignment_id", ""))
    course_id = str(data.get("course_id", ""))
    user_id = str(data.get("author_id", "")) or str(data.get("user_id", ""))
    score = float(data.get("score", 0.0))
    if not assignment_id:
        return
    a = await _assignment(session, assignment_id, course_id or "?", tenant_id)
    a.score_sum += score
    a.score_count += 1
    a.average_score = a.score_sum / max(1, a.score_count)
    a.updated_at = utcnow()
    if course_id:
        cs = await _course(session, course_id, tenant_id)
        # rough running average across assignments
        if cs.assignments_count:
            prev_total = cs.average_score * max(1, cs.assignments_count)
            cs.average_score = (prev_total + score) / (cs.assignments_count + 1)
        else:
            cs.average_score = score
        cs.updated_at = utcnow()
    if user_id and course_id:
        ug = await _ugrades(session, user_id, course_id, tenant_id)
        ug.score_sum += score
        ug.score_count += 1
        ug.average_score = ug.score_sum / max(1, ug.score_count)
        ug.updated_at = utcnow()

async def on_grade_changed(session: AsyncSession, env: dict[str, Any]) -> None:
    data = env.get("data", {})
    diff = float(data.get("score_diff", 0.0))
    if diff == 0.0:
        return
    assignment_id = str(data.get("assignment_id", ""))
    course_id = str(data.get("course_id", ""))
    user_id = str(data.get("user_id", ""))
    tenant_id = env.get("tenant_id", "")
    if assignment_id:
        a = await _assignment(session, assignment_id, course_id or "?", tenant_id)
        a.score_sum += diff
        a.average_score = a.score_sum / max(1, a.score_count)
        a.updated_at = utcnow()
    if user_id and course_id:
        ug = await _ugrades(session, user_id, course_id, tenant_id)
        ug.score_sum += diff
        ug.average_score = ug.score_sum / max(1, ug.score_count)
        ug.updated_at = utcnow()

async def on_plagiarism_run_completed(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    course_id = str(data.get("course_id", ""))
    assignment_id = str(data.get("assignment_id", ""))
    if course_id:
        cs = await _course(session, course_id, tenant_id)
        cs.plagiarism_alerts_count += int(data.get("alerts_count", 0))
        cs.updated_at = utcnow()
    if assignment_id:
        a = await _assignment(session, assignment_id, course_id or "?", tenant_id)
        a.max_similarity = max(a.max_similarity, float(data.get("max_similarity", 0.0)))
        a.updated_at = utcnow()
    t = await _tenant(session, tenant_id)
    t.plagiarism_runs_30d += 1
    t.updated_at = utcnow()

async def on_suspicious_pair(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    course_id = str(data.get("course_id", ""))
    assignment_id = str(data.get("assignment_id", ""))
    user_id = str(data.get("author_id", ""))
    if course_id:
        cs = await _course(session, course_id, tenant_id)
        cs.plagiarism_alerts_count += 1
        cs.updated_at = utcnow()
    if assignment_id:
        a = await _assignment(session, assignment_id, course_id or "?", tenant_id)
        a.suspicious_count += 1
        a.max_similarity = max(a.max_similarity, float(data.get("similarity", 0.0)))
        a.updated_at = utcnow()
    if user_id and course_id:
        ug = await _ugrades(session, user_id, course_id, tenant_id)
        ug.suspicious_count += 1
        ug.updated_at = utcnow()

async def on_ai_completed(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    course_id = str(data.get("course_id", ""))
    assignment_id = str(data.get("assignment_id", ""))
    tokens = int(data.get("tokens", 0))
    cost = float(data.get("cost_usd", 0.0))
    if course_id:
        cs = await _course(session, course_id, tenant_id)
        cs.ai_runs_count += 1
        cs.ai_tokens_used += tokens
        cs.updated_at = utcnow()
    if assignment_id:
        a = await _assignment(session, assignment_id, course_id or "?", tenant_id)
        a.ai_completed_count += 1
        a.updated_at = utcnow()
    t = await _tenant(session, tenant_id)
    t.ai_tokens_total_30d += tokens
    t.ai_cost_total_30d += cost
    t.updated_at = utcnow()

async def on_budget_exceeded(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    t = await _tenant(session, tenant_id)
    t.updated_at = utcnow()

async def on_import_completed(session: AsyncSession, env: dict[str, Any]) -> None:
    tenant_id = env.get("tenant_id", "")
    data = env.get("data", {})
    course_id = str(data.get("course_id", ""))
    imported = int(data.get("submissions_imported", 0))
    if course_id:
        cs = await _course(session, course_id, tenant_id)
        cs.submissions_total += imported
        cs.last_activity_at = utcnow()
        cs.updated_at = utcnow()
    t = await _tenant(session, tenant_id)
    t.submissions_30d += imported
    t.updated_at = utcnow()

async def on_user_anonymized(session: AsyncSession, env: dict[str, Any]) -> None:
    user_id = str(env.get("data", {}).get("user_id", ""))
    if not user_id:
        return
    stmt = select(UserGradesSummary).where(UserGradesSummary.user_id == user_id)
    rows = (await session.execute(stmt)).scalars().all()
    for r in rows:
        r.user_id = f"anon_{user_id[-6:]}"
        r.updated_at = utcnow()

def build_handler_registry() -> dict[str, list[HandlerFn]]:
    return {
        "course.course.created.v1": [on_course_created],
        "course.course.archived.v1": [on_course_archived],
        "course.assignment.created.v1": [on_assignment_created],
        "submission.submission.created.v1": [on_submission_created],
        "submission.grade.assigned.v1": [on_grade_assigned],
        "submission.grade.changed.v1": [on_grade_changed],
        "plagiarism.run.completed.v1": [on_plagiarism_run_completed],
        "plagiarism.suspicious_pair.flagged.v1": [on_suspicious_pair],
        "ai.analysis.completed.v1": [on_ai_completed],
        "ai.budget.exceeded.v1": [on_budget_exceeded],
        "integration.import.completed.v1": [on_import_completed],
        "identity.user.anonymized.v1": [on_user_anonymized],
        "identity.user.deleted.v1": [on_user_anonymized],
    }
