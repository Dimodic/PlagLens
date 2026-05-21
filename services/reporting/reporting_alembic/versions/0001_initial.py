"""initial reporting schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-01

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS reporting")

    op.create_table(
        "export_jobs",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("operation_id", sa.String(40), nullable=False, unique=True),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("scope", sa.JSON, nullable=False),
        sa.Column("format", sa.String(32), nullable=False),
        sa.Column("options", sa.JSON, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("progress_completed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("progress_total", sa.Integer, nullable=False, server_default="0"),
        sa.Column("artifact_uri", sa.String(512)),
        sa.Column("artifact_size_bytes", sa.BigInteger),
        sa.Column("artifact_format", sa.String(32)),
        sa.Column("artifact_filename", sa.String(256)),
        sa.Column("expiry_at", sa.DateTime(timezone=True)),
        sa.Column("triggered_by", sa.String(64), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("error", sa.JSON),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="reporting",
    )
    op.create_index("ix_export_jobs_tenant_id", "export_jobs", ["tenant_id"], schema="reporting")
    op.create_index("ix_export_jobs_kind", "export_jobs", ["kind"], schema="reporting")
    op.create_index("ix_export_jobs_status", "export_jobs", ["status"], schema="reporting")
    op.create_index(
        "ix_export_jobs_tenant_status", "export_jobs", ["tenant_id", "status"], schema="reporting"
    )
    op.create_index(
        "ix_export_jobs_kind_created", "export_jobs", ["kind", "created_at"], schema="reporting"
    )

    op.create_table(
        "scheduled_exports",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("course_id", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("format", sa.String(32), nullable=False),
        sa.Column("target", sa.String(32), nullable=False, server_default="file_download"),
        sa.Column("cron", sa.String(64), nullable=False),
        sa.Column("scope", sa.JSON, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("last_run_at", sa.DateTime(timezone=True)),
        sa.Column("next_run_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        schema="reporting",
    )
    op.create_index("ix_sched_tenant", "scheduled_exports", ["tenant_id"], schema="reporting")
    op.create_index("ix_sched_course", "scheduled_exports", ["course_id"], schema="reporting")

    op.create_table(
        "scheduled_export_runs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "schedule_id",
            sa.String(40),
            sa.ForeignKey("reporting.scheduled_exports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("export_id", sa.String(40)),
        sa.Column("status", sa.String(20), nullable=False, server_default="ok"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("schedule_id", "period_start", name="uq_sched_run_id_period"),
        schema="reporting",
    )

    op.create_table(
        "dashboard_snapshots",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("scope_kind", sa.String(32), nullable=False),
        sa.Column("scope_id", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        schema="reporting",
    )
    op.create_index(
        "ix_dash_snap_tenant_scope_kind",
        "dashboard_snapshots",
        ["tenant_id", "scope_kind", "scope_id", "kind"],
        schema="reporting",
    )

    for table_name, columns in (
        (
            "course_stats",
            [
                sa.Column("course_id", sa.String(64), primary_key=True),
                sa.Column("tenant_id", sa.String(64), nullable=False),
                sa.Column("enrolled_students", sa.Integer, nullable=False, server_default="0"),
                sa.Column("assignments_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("submissions_total", sa.Integer, nullable=False, server_default="0"),
                sa.Column("average_score", sa.Float, nullable=False, server_default="0"),
                sa.Column("plagiarism_alerts_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("ai_runs_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("ai_tokens_used", sa.BigInteger, nullable=False, server_default="0"),
                sa.Column("last_activity_at", sa.DateTime(timezone=True)),
                sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.false()),
                sa.Column(
                    "updated_at",
                    sa.DateTime(timezone=True),
                    nullable=False,
                    server_default=sa.func.now(),
                ),
            ],
        ),
        (
            "assignment_stats",
            [
                sa.Column("assignment_id", sa.String(64), primary_key=True),
                sa.Column("course_id", sa.String(64), nullable=False),
                sa.Column("tenant_id", sa.String(64), nullable=False),
                sa.Column("submissions_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("students_submitted_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("on_time_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("late_soft_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("late_hard_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("average_score", sa.Float, nullable=False, server_default="0"),
                sa.Column("score_sum", sa.Float, nullable=False, server_default="0"),
                sa.Column("score_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("max_similarity", sa.Float, nullable=False, server_default="0"),
                sa.Column("suspicious_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("ai_completed_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column(
                    "updated_at",
                    sa.DateTime(timezone=True),
                    nullable=False,
                    server_default=sa.func.now(),
                ),
            ],
        ),
        (
            "tenant_stats",
            [
                sa.Column("tenant_id", sa.String(64), primary_key=True),
                sa.Column("active_courses", sa.Integer, nullable=False, server_default="0"),
                sa.Column("active_users", sa.Integer, nullable=False, server_default="0"),
                sa.Column("submissions_30d", sa.Integer, nullable=False, server_default="0"),
                sa.Column("ai_tokens_total_30d", sa.BigInteger, nullable=False, server_default="0"),
                sa.Column("ai_cost_total_30d", sa.Float, nullable=False, server_default="0"),
                sa.Column("plagiarism_runs_30d", sa.Integer, nullable=False, server_default="0"),
                sa.Column(
                    "updated_at",
                    sa.DateTime(timezone=True),
                    nullable=False,
                    server_default=sa.func.now(),
                ),
            ],
        ),
        (
            "user_grades_summary",
            [
                sa.Column("user_id", sa.String(64), primary_key=True),
                sa.Column("course_id", sa.String(64), primary_key=True),
                sa.Column("tenant_id", sa.String(64), nullable=False),
                sa.Column("assignments_total", sa.Integer, nullable=False, server_default="0"),
                sa.Column("submissions_total", sa.Integer, nullable=False, server_default="0"),
                sa.Column("average_score", sa.Float, nullable=False, server_default="0"),
                sa.Column("score_sum", sa.Float, nullable=False, server_default="0"),
                sa.Column("score_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("on_time_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("on_time_total", sa.Integer, nullable=False, server_default="0"),
                sa.Column("suspicious_count", sa.Integer, nullable=False, server_default="0"),
                sa.Column("last_activity_at", sa.DateTime(timezone=True)),
                sa.Column(
                    "updated_at",
                    sa.DateTime(timezone=True),
                    nullable=False,
                    server_default=sa.func.now(),
                ),
            ],
        ),
    ):
        op.create_table(table_name, *columns, schema="reporting")

    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.String(64), primary_key=True),
        sa.Column("consumer_group", sa.String(64), nullable=False, server_default="reporting"),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="reporting",
    )

    op.create_table(
        "read_model_health",
        sa.Column("name", sa.String(64), primary_key=True),
        sa.Column("last_event_at", sa.DateTime(timezone=True)),
        sa.Column(
            "last_processed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("lag_seconds", sa.Float, nullable=False, server_default="0"),
        schema="reporting",
    )


def downgrade() -> None:
    for t in (
        "read_model_health",
        "processed_events",
        "user_grades_summary",
        "tenant_stats",
        "assignment_stats",
        "course_stats",
        "dashboard_snapshots",
        "scheduled_export_runs",
        "scheduled_exports",
        "export_jobs",
    ):
        op.drop_table(t, schema="reporting")
