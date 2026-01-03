"""initial plagiarism schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-01

"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "plagiarism"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    # ---------- plagiarism_runs ----------
    op.create_table(
        "plagiarism_runs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("course_id", sa.String(64), nullable=True, index=True),
        sa.Column("assignment_id", sa.String(64), nullable=True, index=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_run_id", sa.String(128), nullable=True),
        sa.Column("scope", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("trigger", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued",
                  index=True),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("submissions_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pairs_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pairs_suspected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_similarity", sa.Float(), nullable=True),
        sa.Column("artifact_html_uri", sa.String(512), nullable=True),
        sa.Column("artifact_json_uri", sa.String(512), nullable=True),
        sa.Column("artifact_archive_uri", sa.String(512), nullable=True),
        sa.Column("triggered_by", sa.String(64), nullable=True),
        sa.Column("error", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("scope_hash", sa.String(64), nullable=True, index=True),
        sa.Column("options_hash", sa.String(64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_runs_idemp",
        "plagiarism_runs",
        ["tenant_id", "assignment_id", "scope_hash", "options_hash", "status"],
        schema=SCHEMA,
    )

    # ---------- plagiarism_pairs ----------
    op.create_table(
        "plagiarism_pairs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("run_id", sa.String(64),
                  sa.ForeignKey(f"{SCHEMA}.plagiarism_runs.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("a_submission_id", sa.String(64), nullable=False, index=True),
        sa.Column("b_submission_id", sa.String(64), nullable=False, index=True),
        sa.Column("a_author_id", sa.String(64), nullable=True),
        sa.Column("b_author_id", sa.String(64), nullable=True),
        sa.Column("a_author_display_name", sa.String(256), nullable=True),
        sa.Column("b_author_display_name", sa.String(256), nullable=True),
        sa.Column("similarity", sa.Float(), nullable=False, index=True),
        sa.Column("matched_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fragments", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'[]'::jsonb")),
        sa.Column("cross_course", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cross_assignment", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cross_tenant", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        schema=SCHEMA,
    )

    # ---------- plagiarism_clusters ----------
    op.create_table(
        "plagiarism_clusters",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("run_id", sa.String(64),
                  sa.ForeignKey(f"{SCHEMA}.plagiarism_runs.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("members", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'[]'::jsonb")),
        sa.Column("avg_similarity", sa.Float(), nullable=False, server_default="0"),
        sa.Column("dominant_language", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        schema=SCHEMA,
    )

    # ---------- corpus_entries ----------
    op.create_table(
        "corpus_entries",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("course_id", sa.String(64), nullable=True, index=True),
        sa.Column("assignment_id", sa.String(64), nullable=True, index=True),
        sa.Column("submission_id", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("language", sa.String(32), nullable=True, index=True),
        sa.Column("fingerprints", sa.LargeBinary(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )

    # ---------- provider_configs ----------
    op.create_table(
        "provider_configs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("provider", sa.String(32), nullable=False, index=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("default_for_tenant", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("credentials_secret_ref", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "provider", name="uq_provider_per_tenant"),
        schema=SCHEMA,
    )

    # ---------- suspicious_flags ----------
    op.create_table(
        "suspicious_flags",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("submission_id", sa.String(64), nullable=False, index=True),
        sa.Column("run_id", sa.String(64), nullable=True, index=True),
        sa.Column("reason", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False, server_default="low"),
        sa.Column("similarity", sa.Float(), nullable=True),
        sa.Column("paired_with", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("cleared_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cleared_by", sa.String(64), nullable=True),
        sa.Column("dismiss_reason", sa.String(512), nullable=True),
        schema=SCHEMA,
    )

    # ---------- webhook_subscriptions ----------
    op.create_table(
        "webhook_subscriptions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("events", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'[]'::jsonb")),
        sa.Column("secret", sa.String(128), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    for tbl in (
        "webhook_subscriptions",
        "suspicious_flags",
        "provider_configs",
        "corpus_entries",
        "plagiarism_clusters",
        "plagiarism_pairs",
        "plagiarism_runs",
    ):
        op.drop_table(tbl, schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
