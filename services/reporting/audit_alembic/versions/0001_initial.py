"""initial schema for audit service

Revision ID: 0001
Revises:
Create Date: 2026-05-01

Creates schema ``audit`` with:
- audit_events parent table partitioned BY RANGE (recorded_at)
- 12 monthly partitions for 2026 (audit_events_2026_01..2026_12)
- GIN index on tsvector(action || actor_id || resource_id || metadata::text)
- retention_policies, legal_holds, processed_events
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "audit"


def _create_partition(year: int, month: int) -> None:
    name = f"audit_events_{year:04d}_{month:02d}"
    if month == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, month + 1
    op.execute(
        f'CREATE TABLE IF NOT EXISTS "{SCHEMA}"."{name}" '
        f'PARTITION OF "{SCHEMA}"."audit_events" '
        f"FOR VALUES FROM ('{year:04d}-{month:02d}-01') "
        f"TO ('{next_year:04d}-{next_month:02d}-01');"
    )


def upgrade() -> None:
    op.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')

    # ---- audit_events (partitioned parent) -------------------------------- #
    op.execute(
        f"""
        CREATE TABLE "{SCHEMA}"."audit_events" (
            id              CHAR(26)               NOT NULL,
            recorded_at     TIMESTAMPTZ            NOT NULL DEFAULT now(),
            event_id        VARCHAR(128)           NULL,
            tenant_id       VARCHAR(64)            NULL,
            occurred_at     TIMESTAMPTZ            NOT NULL DEFAULT now(),
            actor_type      VARCHAR(32)            NOT NULL DEFAULT 'user',
            actor_id        VARCHAR(64)            NULL,
            actor_role      VARCHAR(32)            NULL,
            actor           JSONB                  NOT NULL DEFAULT '{{}}'::jsonb,
            action          VARCHAR(128)           NOT NULL,
            result          VARCHAR(16)            NOT NULL DEFAULT 'success',
            resource_type   VARCHAR(64)            NULL,
            resource_id     VARCHAR(64)            NULL,
            resource        JSONB                  NOT NULL DEFAULT '{{}}'::jsonb,
            source_service  VARCHAR(64)            NULL,
            request_id      VARCHAR(64)            NULL,
            ip              VARCHAR(64)            NULL,
            user_agent      VARCHAR(512)           NULL,
            "before"        JSONB                  NULL,
            "after"         JSONB                  NULL,
            metadata        JSONB                  NOT NULL DEFAULT '{{}}'::jsonb,
            retention_class VARCHAR(32)            NOT NULL DEFAULT 'default',
            PRIMARY KEY (id, recorded_at)
        ) PARTITION BY RANGE (recorded_at);
        """
    )

    # B-tree indexes (on parent → propagate to partitions).
    op.execute(
        f'CREATE INDEX IF NOT EXISTS ix_audit_events_tenant_recorded '
        f'ON "{SCHEMA}"."audit_events" (tenant_id, recorded_at);'
    )
    op.execute(
        f'CREATE INDEX IF NOT EXISTS ix_audit_events_action_recorded '
        f'ON "{SCHEMA}"."audit_events" (action, recorded_at);'
    )
    op.execute(
        f'CREATE INDEX IF NOT EXISTS ix_audit_events_actor '
        f'ON "{SCHEMA}"."audit_events" (actor_id);'
    )
    op.execute(
        f'CREATE INDEX IF NOT EXISTS ix_audit_events_resource '
        f'ON "{SCHEMA}"."audit_events" (resource_type, resource_id);'
    )
    op.execute(
        f'CREATE INDEX IF NOT EXISTS ix_audit_events_request_id '
        f'ON "{SCHEMA}"."audit_events" (request_id);'
    )
    op.execute(
        f'CREATE INDEX IF NOT EXISTS ix_audit_events_event_id '
        f'ON "{SCHEMA}"."audit_events" (event_id);'
    )

    # GIN full-text on action || actor_id || resource_id || metadata::text.
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS ix_audit_events_fts
        ON "{SCHEMA}"."audit_events"
        USING GIN (
            to_tsvector(
                'simple',
                coalesce(action, '') || ' ' ||
                coalesce(actor_id, '') || ' ' ||
                coalesce(resource_id, '') || ' ' ||
                coalesce(metadata::text, '')
            )
        );
        """
    )

    # 12 monthly partitions for 2026.
    for m in range(1, 13):
        _create_partition(2026, m)

    # ---- retention_policies ---------------------------------------------- #
    op.create_table(
        "retention_policies",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("scope", sa.String(length=16), nullable=False, server_default="tenant"),
        sa.Column("scope_id", sa.String(length=64), nullable=True),
        sa.Column(
            "default_retention_days", sa.Integer(), nullable=False, server_default="365"
        ),
        sa.Column(
            "long_retention_days", sa.Integer(), nullable=False, server_default="2555"
        ),
        sa.Column(
            "legal_hold_active",
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
        sa.Column("updated_by", sa.String(length=64), nullable=True),
        sa.UniqueConstraint("scope", "scope_id", name="uq_retention_scope"),
        schema=SCHEMA,
    )

    # ---- legal_holds ----------------------------------------------------- #
    op.create_table(
        "legal_holds",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=True),
        sa.Column("resource_type", sa.String(length=64), nullable=True),
        sa.Column("resource_id", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_by", sa.String(length=64), nullable=True),
        sa.Index("ix_legal_holds_resource", "resource_type", "resource_id"),
        sa.Index("ix_legal_holds_tenant_active", "tenant_id", "ended_at"),
        schema=SCHEMA,
    )

    # ---- processed_events (Kafka idempotency) ---------------------------- #
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
    op.create_index(
        "ix_processed_events_consumed_at",
        "processed_events",
        ["consumed_at"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_processed_events_consumed_at", table_name="processed_events", schema=SCHEMA
    )
    op.drop_table("processed_events", schema=SCHEMA)
    op.drop_table("legal_holds", schema=SCHEMA)
    op.drop_table("retention_policies", schema=SCHEMA)
    # Drop child partitions then parent.
    for m in range(1, 13):
        name = f"audit_events_2026_{m:02d}"
        op.execute(f'DROP TABLE IF EXISTS "{SCHEMA}"."{name}";')
    op.execute(f'DROP TABLE IF EXISTS "{SCHEMA}"."audit_events";')
    op.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}"')
