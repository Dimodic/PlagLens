"""initial schema for submission service

Revision ID: 0001
Revises:
Create Date: 2026-05-01

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "submission"


def upgrade() -> None:
    op.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')

    op.create_table(
        "submissions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("course_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("assignment_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("author_id", sa.String(length=64), nullable=True, index=True),
        sa.Column("anon_id", sa.String(length=64), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("external_id", sa.String(length=128), nullable=True),
        sa.Column("external_url", sa.Text(), nullable=True),
        sa.Column("language", sa.String(length=32), nullable=True),
        sa.Column("content_hash", sa.String(length=128), nullable=False, index=True),
        sa.Column("total_size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("external_verdict", sa.String(length=16), nullable=True),
        sa.Column("external_score", sa.Numeric(8, 3), nullable=True),
        sa.Column("is_late", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("late_kind", sa.String(length=8), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="received"),
        sa.Column(
            "flags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "selected_for_grading",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("selected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.String(length=64), nullable=True),
        sa.UniqueConstraint(
            "assignment_id",
            "author_id",
            "content_hash",
            name="uq_submission_dedup",
        ),
        sa.UniqueConstraint(
            "source",
            "external_id",
            "tenant_id",
            name="uq_submission_external",
        ),
        sa.Index("ix_submissions_tenant_assignment", "tenant_id", "assignment_id"),
        sa.Index("ix_submissions_author_assignment", "author_id", "assignment_id"),
        schema=SCHEMA,
    )

    op.create_table(
        "submission_files",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("submission_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("path", sa.String(length=1024), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("mime_type", sa.String(length=128), nullable=True),
        sa.Column("content_hash", sa.String(length=128), nullable=False),
        sa.Column("storage_uri", sa.String(length=2048), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            [f"{SCHEMA}.submissions.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "submission_grades",
        sa.Column("submission_id", sa.String(length=64), primary_key=True),
        sa.Column("score", sa.Numeric(8, 3), nullable=True),
        sa.Column("max_score", sa.Numeric(8, 3), nullable=True),
        sa.Column(
            "applied_multiplier",
            sa.Numeric(6, 3),
            nullable=False,
            server_default="1.000",
        ),
        sa.Column("graded_by", sa.String(length=64), nullable=True),
        sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "comment_visible_to_student",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "history",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            [f"{SCHEMA}.submissions.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "submission_grade_history",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("submission_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("score", sa.Numeric(8, 3), nullable=True),
        sa.Column("applied_multiplier", sa.Numeric(6, 3), nullable=True),
        sa.Column("graded_by", sa.String(length=64), nullable=True),
        sa.Column(
            "graded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            [f"{SCHEMA}.submissions.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "submission_feedback",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("submission_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("author_id", sa.String(length=64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "visible_to_student",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("source", sa.String(length=24), nullable=False, server_default="manual"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            [f"{SCHEMA}.submissions.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "submission_flags",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("submission_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("set_by", sa.String(length=64), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("cleared_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            [f"{SCHEMA}.submissions.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.String(length=128), primary_key=True),
        sa.Column("consumer_group", sa.String(length=128), nullable=False),
        sa.Column(
            "consumed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "operations",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
        sa.Column(
            "progress",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "metadata_",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_url", sa.Text(), nullable=True),
        sa.Column("error", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    for table in (
        "operations",
        "processed_events",
        "submission_flags",
        "submission_feedback",
        "submission_grade_history",
        "submission_grades",
        "submission_files",
        "submissions",
    ):
        op.drop_table(table, schema=SCHEMA)
    op.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}"')
