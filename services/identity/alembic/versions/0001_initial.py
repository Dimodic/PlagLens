"""initial identity schema

Revision ID: 0001
Revises:
Create Date: 2026-05-01 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.create_table(
        "tenants",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("domain", sa.String(255), nullable=True),
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "cors_origins",
            postgresql.ARRAY(sa.String(255)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("display_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("avatar_url", sa.String(1024), nullable=True),
        sa.Column("locale", sa.String(8), nullable=False, server_default="ru"),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column(
            "global_role",
            sa.String(32),
            nullable=False,
            server_default="student",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("anonymized_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        schema=SCHEMA,
    )

    op.create_table(
        "oauth_identities",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_user_id", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column(
            "raw_profile",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "linked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "provider", "provider_user_id", name="uq_oauth_provider_subject"
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "external_bindings",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("system", sa.String(32), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column(
            "linked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "system", "external_id", name="uq_external_binding"
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("refresh_token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )

    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "owner_user_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key_hash", sa.String(128), nullable=False, unique=True),
        sa.Column(
            "scopes",
            postgresql.ARRAY(sa.String(64)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )

    op.create_table(
        "email_verify_tokens",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )

    op.create_table(
        "two_factor_secrets",
        sa.Column(
            "user_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("secret_encrypted", sa.LargeBinary, nullable=False),
        sa.Column(
            "backup_codes",
            postgresql.ARRAY(sa.String(255)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("enabled_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )

    op.create_table(
        "invitations",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("course_id", sa.String(40), nullable=True),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_by", sa.String(40), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("created_by", sa.String(40), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    for table in [
        "invitations",
        "two_factor_secrets",
        "email_verify_tokens",
        "password_reset_tokens",
        "api_keys",
        "sessions",
        "external_bindings",
        "oauth_identities",
        "users",
        "tenants",
    ]:
        op.drop_table(table, schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
