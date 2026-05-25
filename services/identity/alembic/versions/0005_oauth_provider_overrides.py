"""oauth_provider_overrides — per-install OAuth client_id/secret overrides

Lets an admin edit OAuth credentials through the UI instead of having to
SSH into the host and edit infra/.env. A row in this table (with non-empty
values) replaces the corresponding env var at runtime; env stays as the
boot-time fallback.

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-25 17:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"


def upgrade() -> None:
    op.create_table(
        "oauth_provider_overrides",
        sa.Column("provider", sa.String(length=32), primary_key=True),
        sa.Column("client_id", sa.String(length=255), nullable=True),
        sa.Column("client_secret", sa.String(length=255), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_by", sa.String(length=40), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("oauth_provider_overrides", schema=SCHEMA)
