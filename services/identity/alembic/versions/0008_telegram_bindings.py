"""telegram_bindings — user ↔ Telegram chat linking moves to identity

Account-linking belongs with identity (alongside ``oauth_identities`` and
``external_bindings``), so the user ↔ Telegram-chat binding now lives in the
``identity`` schema. The mirror table previously held by the integration
service (``integration.telegram_bindings``) is dropped in that service's own
migration; it was empty, so there is no data to migrate.

Mirrors the former integration table's columns, with identity conventions:
String(40) id, FK on ``user_id`` → ``identity.users`` (ON DELETE CASCADE).

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-01 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"


def upgrade() -> None:
    op.create_table(
        "telegram_bindings",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(40),
            sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("tenant_id", sa.String(40), nullable=False),
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
        "ix_telegram_bindings_user_id",
        "telegram_bindings",
        ["user_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_telegram_bindings_tenant_id",
        "telegram_bindings",
        ["tenant_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_telegram_bindings_chat_id",
        "telegram_bindings",
        ["chat_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_telegram_bindings_chat_id",
        table_name="telegram_bindings",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_telegram_bindings_tenant_id",
        table_name="telegram_bindings",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_telegram_bindings_user_id",
        table_name="telegram_bindings",
        schema=SCHEMA,
    )
    op.drop_table("telegram_bindings", schema=SCHEMA)
