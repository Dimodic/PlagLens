"""Dashboard response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CourseOverview(BaseModel):
    course_id: str
    enrolled_students: int = 0
    assignments_count: int = 0
    submissions_total: int = 0
    average_score: float = 0.0
    plagiarism_alerts_count: int = 0
    ai_runs_count: int = 0
    ai_tokens_used: int = 0
    last_activity_at: datetime | None = None
    cached: bool = False


class GradesDistribution(BaseModel):
    course_id: str
    buckets: list[dict[str, Any]] = Field(default_factory=list)


class GradesByAssignment(BaseModel):
    course_id: str
    assignments: list[dict[str, Any]] = Field(default_factory=list)


class PlagiarismStats(BaseModel):
    course_id: str
    suspicious_rate: float = 0.0
    max_similarity: float = 0.0
    runs_total: int = 0
    runs_over_time: list[dict[str, Any]] = Field(default_factory=list)


class AiUsageSummary(BaseModel):
    course_id: str | None = None
    tenant_id: str | None = None
    runs: int = 0
    tokens: int = 0
    cost_usd: float = 0.0
    cache_hits: int = 0
    budget_status: str = "ok"


class TenantOverview(BaseModel):
    tenant_id: str
    active_courses: int = 0
    active_users: int = 0
    submissions_30d: int = 0
    plagiarism_runs_30d: int = 0
    ai_tokens_total_30d: int = 0
    ai_cost_total_30d: float = 0.0
    cached: bool = False


class GlobalOverview(BaseModel):
    tenants: int = 0
    active_users: int = 0
    submissions_30d: int = 0
    plagiarism_runs_30d: int = 0
    ai_tokens_total_30d: int = 0


class StudentDashboard(BaseModel):
    user_id: str
    courses: list[dict[str, Any]] = Field(default_factory=list)
    average_score: float = 0.0
    upcoming_deadlines: list[dict[str, Any]] = Field(default_factory=list)


class GradesSummary(BaseModel):
    user_id: str
    course_id: str
    assignments_total: int = 0
    submissions_total: int = 0
    average_score: float = 0.0
    on_time_rate: float = 0.0
    suspicious_count: int = 0


class ReadModelHealth(BaseModel):
    name: str
    lag_seconds: float
    last_event_at: datetime | None = None
    last_processed_at: datetime
