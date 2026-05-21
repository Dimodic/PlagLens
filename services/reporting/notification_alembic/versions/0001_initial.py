"""initial schema for notification service

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

SCHEMA = "notification"


def upgrade() -> None:
    op.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')

    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("user_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("event_id", sa.String(length=128), nullable=True, index=True),
        sa.Column("event_type", sa.String(length=128), nullable=False, index=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("action_url", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="info"),
        sa.Column(
            "metadata_",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "channels_attempted",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "seq",
            sa.BigInteger(),
            sa.Identity(start=1, cycle=False),
            nullable=False,
            unique=True,
        ),
        sa.Index("ix_notifications_user_created", "user_id", "created_at"),
        sa.Index("ix_notifications_user_unread", "user_id", "read_at"),
        schema=SCHEMA,
    )

    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("notification_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "attempted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            [f"{SCHEMA}.notifications.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, index=True),
        sa.Column(
            "channels_enabled",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text(
                "'{\"inapp\": true, \"email\": true, \"telegram\": false}'::jsonb"
            ),
        ),
        sa.Column(
            "email_digest_frequency",
            sa.String(length=16),
            nullable=False,
            server_default="instant",
        ),
        sa.Column(
            "per_event",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("quiet_hours_start", sa.String(length=8), nullable=True),
        sa.Column("quiet_hours_end", sa.String(length=8), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC"),
        sa.Column("locale", sa.String(length=8), nullable=False, server_default="ru"),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("telegram_chat_id", sa.String(length=64), nullable=True),
        sa.Column(
            "email_disabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "telegram_revoked",
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
        schema=SCHEMA,
    )

    op.create_table(
        "notification_templates",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("event_type", sa.String(length=128), nullable=False, index=True),
        sa.Column("locale", sa.String(length=8), nullable=False, server_default="ru"),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("subject_template", sa.Text(), nullable=False, server_default=""),
        sa.Column("body_template", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "event_type", "locale", "channel", "version",
            name="uq_template_etype_locale_channel_version",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "email_transport_config",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=True, index=True),
        sa.Column("provider", sa.String(length=16), nullable=False, server_default="mailgun"),
        sa.Column("api_key_secret_ref", sa.String(length=512), nullable=True),
        sa.Column("from_email", sa.String(length=320), nullable=False),
        sa.Column("from_name", sa.String(length=128), nullable=False, server_default="PlagLens"),
        sa.Column("reply_to", sa.String(length=320), nullable=True),
        sa.Column(
            "dns_validated",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "default_for_tenant",
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
        schema=SCHEMA,
    )

    op.create_table(
        "web_push_subscriptions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column(
            "keys",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("user_id", "endpoint", name="uq_webpush_user_endpoint"),
        schema=SCHEMA,
    )

    op.create_table(
        "email_bounces",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=True, index=True),
        sa.Column("email", sa.String(length=320), nullable=False, index=True),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="hard"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
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
        "telegram_bot_config",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("token_secret_ref", sa.String(length=512), nullable=True),
        sa.Column("bot_username", sa.String(length=128), nullable=True),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    for table in (
        "telegram_bot_config",
        "processed_events",
        "email_bounces",
        "web_push_subscriptions",
        "email_transport_config",
        "notification_templates",
        "notification_preferences",
        "notification_deliveries",
        "notifications",
    ):
        op.drop_table(table, schema=SCHEMA)
    op.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}"')
