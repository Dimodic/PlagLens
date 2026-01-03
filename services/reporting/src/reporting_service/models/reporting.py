"""ORM models for the Reporting Service.

All tables live in the ``reporting`` schema. Read-models are denormalised
projections fed by Kafka consumers; everything else is owned local state.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    operation_id: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)

    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scope: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    fmt: Mapped[str] = mapped_column("format", String(32), nullable=False)
    options: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)
    progress_completed: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)

    artifact_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    artifact_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    artifact_format: Mapped[str | None] = mapped_column(String(32), nullable=True)
    artifact_filename: Mapped[str | None] = mapped_column(String(256), nullable=True)
    expiry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    triggered_by: Mapped[str] = mapped_column(String(64), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_export_jobs_tenant_status", "tenant_id", "status"),
        Index("ix_export_jobs_kind_created", "kind", "created_at"),
    )


class ScheduledExport(Base):
    __tablename__ = "scheduled_exports"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    course_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    fmt: Mapped[str] = mapped_column("format", String(32), nullable=False)
    target: Mapped[str] = mapped_column(String(32), nullable=False, default="file_download")
    cron: Mapped[str] = mapped_column(String(64), nullable=False)
    scope: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    runs: Mapped[list[ScheduledExportRun]] = relationship(
        back_populates="schedule", cascade="all, delete-orphan"
    )


class ScheduledExportRun(Base):
    __tablename__ = "scheduled_export_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[str] = mapped_column(
        ForeignKey("reporting.scheduled_exports.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    export_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ok")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    schedule: Mapped[ScheduledExport] = relationship(back_populates="runs")

    __table_args__ = (
        UniqueConstraint("schedule_id", "period_start", name="uq_sched_run_id_period"),
    )


class DashboardSnapshot(Base):
    __tablename__ = "dashboard_snapshots"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scope_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    scope_id: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_dash_snap_tenant_scope_kind", "tenant_id", "scope_kind", "scope_id", "kind"),
    )


class CourseStats(Base):
    __tablename__ = "course_stats"

    course_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    enrolled_students: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    assignments_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    submissions_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    average_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    plagiarism_alerts_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_runs_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_tokens_used: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AssignmentStats(Base):
    __tablename__ = "assignment_stats"

    assignment_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    submissions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    students_submitted_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    on_time_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    late_soft_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    late_hard_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    average_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    score_sum: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    score_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_similarity: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    suspicious_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_completed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TenantStats(Base):
    __tablename__ = "tenant_stats"

    tenant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    active_courses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    submissions_30d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_tokens_total_30d: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    ai_cost_total_30d: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    plagiarism_runs_30d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UserGradesSummary(Base):
    __tablename__ = "user_grades_summary"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    assignments_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    submissions_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    average_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    score_sum: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    score_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    on_time_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    on_time_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    suspicious_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProcessedEvent(Base):
    __tablename__ = "processed_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    consumer_group: Mapped[str] = mapped_column(String(64), nullable=False, default="reporting")
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ReadModelHealth(Base):
    __tablename__ = "read_model_health"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    lag_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
