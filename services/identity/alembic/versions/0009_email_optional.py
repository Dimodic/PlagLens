"""email optional — drop synthetic addresses, partial unique index

Email is no longer required. OAuth / Telegram accounts authenticate by their
``(provider, subject)`` link (``oauth_identities``), so they no longer need a
synthetic ``tg-<id>@telegram.plaglens.local`` address just to satisfy a NOT
NULL column.

This migration:
  1. Makes ``identity.users.email`` nullable.
  2. Replaces the full ``UNIQUE(tenant_id, email)`` constraint with a PARTIAL
     unique index — enforced only ``WHERE email IS NOT NULL`` — so any number
     of email-less accounts can coexist per tenant while real addresses stay
     unique.
  3. NULLs out the existing synthetic Telegram emails. Their account identity
     is the untouched ``oauth_identities(provider='telegram', ...)`` row, so
     re-login still resolves them. We match ONLY the synthetic
     ``…@telegram.plaglens.local`` domain — real addresses such as
     ``admin@plaglens.local`` are left intact.

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-01
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"


def upgrade() -> None:
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(320),
        nullable=True,
        schema=SCHEMA,
    )
    op.drop_constraint(
        "uq_users_tenant_email", "users", schema=SCHEMA, type_="unique"
    )
    op.create_index(
        "uq_users_tenant_email",
        "users",
        ["tenant_id", "email"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("email IS NOT NULL"),
    )
    op.execute(
        f"UPDATE {SCHEMA}.users SET email = NULL "
        "WHERE email LIKE 'tg-%@telegram.plaglens.local'"
    )


def downgrade() -> None:
    # Best-effort: re-synthesize addresses for nulled rows so NOT NULL + the
    # full UNIQUE can be restored. The original telegram id isn't recoverable
    # here, so we key on the (unique) user id instead.
    op.execute(
        f"UPDATE {SCHEMA}.users "
        "SET email = 'tg-' || id || '@telegram.plaglens.local' "
        "WHERE email IS NULL"
    )
    op.drop_index("uq_users_tenant_email", table_name="users", schema=SCHEMA)
    op.create_unique_constraint(
        "uq_users_tenant_email", "users", ["tenant_id", "email"], schema=SCHEMA
    )
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(320),
        nullable=False,
        schema=SCHEMA,
    )
