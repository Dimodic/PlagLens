"""initial schema for integration service

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-01

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "integration"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.create_table(
        "integration_configs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("course_id", sa.String(64), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending_auth"),
        sa.Column("credentials_secret_ref", sa.String(255), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("cursor", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_status", sa.String(32), nullable=True),
        sa.Column("last_sync_error", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_integration_configs_tenant_id",
        "integration_configs",
        ["tenant_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_integration_configs_course_id",
        "integration_configs",
        ["course_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_integration_configs_kind",
        "integration_configs",
        ["kind"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_integration_configs_tenant_kind",
        "integration_configs",
        ["tenant_id", "kind"],
        schema=SCHEMA,
    )

    op.create_table(
        "import_jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("integration_id", sa.String(64), nullable=False),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("scope", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("trigger", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("progress", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("stats", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("error", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["integration_id"],
            [f"{SCHEMA}.integration_configs.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_import_jobs_integration_id",
        "import_jobs",
        ["integration_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_import_jobs_tenant_id", "import_jobs", ["tenant_id"], schema=SCHEMA
    )

    op.create_table(
        "sync_schedules",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("integration_id", sa.String(64), nullable=False),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("cron", sa.String(128), nullable=False),
        sa.Column("scope", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["integration_id"],
            [f"{SCHEMA}.integration_configs.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sync_schedules_integration_id",
        "sync_schedules",
        ["integration_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sync_schedules_tenant_id", "sync_schedules", ["tenant_id"], schema=SCHEMA
    )

    op.create_table(
        "webhook_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("integration_id", sa.String(64), nullable=True),
        sa.Column("tenant_id", sa.String(64), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("external_event_id", sa.String(128), nullable=True),
        sa.Column("payload_hash", sa.String(64), nullable=True),
        sa.Column("signature_valid", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("raw_payload", sa.Text(), nullable=True),
        sa.Column("raw_payload_uri", sa.String(255), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="received"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.UniqueConstraint("kind", "external_event_id", name="uq_webhook_external_event"),
        schema=SCHEMA,
    )
    op.create_index("ix_webhook_events_kind", "webhook_events", ["kind"], schema=SCHEMA)
    op.create_index(
        "ix_webhook_events_kind_status", "webhook_events", ["kind", "status"], schema=SCHEMA
    )
    op.create_index(
        "ix_webhook_events_external_event_id",
        "webhook_events",
        ["external_event_id"],
        schema=SCHEMA,
    )

    op.create_table(
        "telegram_bindings",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False, unique=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=True),
        sa.Column("username", sa.String(64), nullable=True),
        sa.Column("verification_token", sa.String(64), nullable=True, unique=True),
        sa.Column("bound_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_telegram_bindings_chat_id", "telegram_bindings", ["chat_id"], schema=SCHEMA
    )
    op.create_index(
        "ix_telegram_bindings_tenant_id", "telegram_bindings", ["tenant_id"], schema=SCHEMA
    )

    op.create_table(
        "google_sheets_links",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("course_id", sa.String(64), nullable=False, unique=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("spreadsheet_id", sa.String(128), nullable=False),
        sa.Column("sheet_name", sa.String(128), nullable=False),
        sa.Column(
            "columns_mapping", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")
        ),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_google_sheets_links_tenant_id",
        "google_sheets_links",
        ["tenant_id"],
        schema=SCHEMA,
    )

    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.String(64), primary_key=True),
        sa.Column("consumer_group", sa.String(64), nullable=False),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("processed_events", schema=SCHEMA)
    op.drop_table("google_sheets_links", schema=SCHEMA)
    op.drop_table("telegram_bindings", schema=SCHEMA)
    op.drop_table("webhook_events", schema=SCHEMA)
    op.drop_table("sync_schedules", schema=SCHEMA)
    op.drop_table("import_jobs", schema=SCHEMA)
    op.drop_table("integration_configs", schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
