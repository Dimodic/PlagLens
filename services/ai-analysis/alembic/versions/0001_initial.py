"""Initial schema for ai_analysis service.

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-01
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "ai_analysis"


def upgrade() -> None:
    op.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')

    op.create_table(
        "prompt_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("user_template", sa.Text(), nullable=False),
        sa.Column("json_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("active_for_tenant", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_prompt_versions_tenant_active",
        "prompt_versions",
        ["tenant_id", "active_for_tenant"],
        schema=SCHEMA,
    )

    op.create_table(
        "provider_configs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("base_url", sa.String(500), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("api_key_secret_ref", sa.String(500), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("default_for_tenant", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("priority", sa.Integer(), nullable=False, server_default=sa.text("100")),
        sa.Column("rate_limit_rpm", sa.Integer(), nullable=False, server_default=sa.text("60")),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default=sa.text("8192")),
        sa.Column("supports_json_schema", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_provider_configs_tenant_priority",
        "provider_configs",
        ["tenant_id", "priority"],
        schema=SCHEMA,
    )

    op.create_table(
        "ai_analyses",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, index=True),
        sa.Column("course_id", sa.String(64), nullable=True, index=True),
        sa.Column("assignment_id", sa.String(64), nullable=True, index=True),
        sa.Column("submission_id", sa.String(64), nullable=False, index=True),
        sa.Column("prompt_version", sa.String(64), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("trigger", sa.String(32), nullable=False, server_default=sa.text("'manual'")),
        sa.Column("cache_key", sa.String(128), nullable=False, index=True),
        sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw_llm_response", sa.Text(), nullable=True),
        sa.Column("injection_suspected", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("cost_estimate", sa.Numeric(14, 6), nullable=False, server_default=sa.text("0")),
        sa.Column("currency", sa.String(8), nullable=False, server_default=sa.text("'USD'")),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("parent_analysis_id", sa.String(64), nullable=True, index=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("shared_with_student", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("curated_feedback_id", sa.String(64), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_ai_analyses_submission_status",
        "ai_analyses",
        ["submission_id", "status"],
        schema=SCHEMA,
    )

    op.create_table(
        "budget_configs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("scope_id", sa.String(64), nullable=False),
        sa.Column("period", sa.String(16), nullable=False),
        sa.Column("max_tokens", sa.BigInteger(), nullable=True),
        sa.Column("max_cost", sa.Numeric(14, 6), nullable=True),
        sa.Column("soft_warn_at", sa.Numeric(4, 2), nullable=False, server_default=sa.text("0.8")),
        sa.Column("hard_stop_at", sa.Numeric(4, 2), nullable=False, server_default=sa.text("1.0")),
        sa.Column("reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("scope", "scope_id", name="uq_budget_scope"),
        schema=SCHEMA,
    )

    op.create_table(
        "budget_usages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("scope_id", sa.String(64), nullable=False),
        sa.Column("period", sa.String(16), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rolling", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("prompt_tokens", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("completion_tokens", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_cost", sa.Numeric(14, 6), nullable=False, server_default=sa.text("0")),
        sa.Column("analyses_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("cache_hits", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_warned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("scope", "scope_id", "period", "period_start", name="uq_budget_usage_period"),
        schema=SCHEMA,
    )

    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.String(128), primary_key=True),
        sa.Column("consumer_group", sa.String(128), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("processed_events", schema=SCHEMA)
    op.drop_table("budget_usages", schema=SCHEMA)
    op.drop_table("budget_configs", schema=SCHEMA)
    op.drop_index("ix_ai_analyses_submission_status", table_name="ai_analyses", schema=SCHEMA)
    op.drop_table("ai_analyses", schema=SCHEMA)
    op.drop_index("ix_provider_configs_tenant_priority", table_name="provider_configs", schema=SCHEMA)
    op.drop_table("provider_configs", schema=SCHEMA)
    op.drop_index("ix_prompt_versions_tenant_active", table_name="prompt_versions", schema=SCHEMA)
    op.drop_table("prompt_versions", schema=SCHEMA)
    op.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}"')
