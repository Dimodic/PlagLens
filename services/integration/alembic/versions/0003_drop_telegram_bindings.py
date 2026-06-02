"""drop telegram_bindings — user ↔ Telegram chat linking moved to identity

The user ↔ Telegram-chat binding is account-linking, so it now lives in the
identity service (``identity.telegram_bindings``, created in identity's own
migration 0008). This drops the now-unused integration-schema mirror table.

The table was empty (0 rows), so there is no data to migrate — a plain DROP
is safe. The downgrade re-creates the table verbatim (matching the original
0001_initial definition) so the migration is reversible.

Revision ID: 0003_drop_telegram_bindings
Revises: 0002_oauth_app_credentials
Create Date: 2026-06-01
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_drop_telegram_bindings"
down_revision: Union[str, None] = "0002_oauth_app_credentials"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "integration"


def upgrade() -> None:
    op.drop_index(
        "ix_telegram_bindings_tenant_id",
        table_name="telegram_bindings",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_telegram_bindings_chat_id",
        table_name="telegram_bindings",
        schema=SCHEMA,
    )
    op.drop_table("telegram_bindings", schema=SCHEMA)


def downgrade() -> None:
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
        "ix_telegram_bindings_chat_id",
        "telegram_bindings",
        ["chat_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_telegram_bindings_tenant_id",
        "telegram_bindings",
        ["tenant_id"],
        schema=SCHEMA,
    )
