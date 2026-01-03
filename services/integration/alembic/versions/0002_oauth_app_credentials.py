"""oauth_app_credentials — admin-managed global OAuth client creds

Stores per-tenant OAuth-client credentials (client_id / client_secret /
redirect_uri / scope) that the integration-service uses on behalf of any
teacher in the tenant. Replaces the static `.env.local` fallback in
production deployments.

Revision ID: 0002_oauth_app_credentials
Revises: 0001_initial
Create Date: 2026-05-10
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_oauth_app_credentials"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "integration"


def upgrade() -> None:
    op.create_table(
        "oauth_app_credentials",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("provider_kind", sa.String(32), nullable=False),
        sa.Column("client_id", sa.String(255), nullable=False),
        sa.Column("client_secret", sa.String(255), nullable=False),
        sa.Column("redirect_uri", sa.String(500), nullable=False),
        sa.Column("scope", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.UniqueConstraint(
            "tenant_id", "provider_kind", name="uq_oauth_creds_tenant_provider"
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_oauth_creds_tenant",
        "oauth_app_credentials",
        ["tenant_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("ix_oauth_creds_tenant", table_name="oauth_app_credentials", schema=SCHEMA)
    op.drop_table("oauth_app_credentials", schema=SCHEMA)
