"""invitations.code — human-readable short code for redeem flow

Adds a unique ``code`` column to ``invitations`` so users can type the code
into ``/me`` after registering instead of clicking a long URL. Format:
``XXX-XXX-XXX`` (9 chars in 3 dash-separated groups; uppercase A-Z2-9, no
visually-confusable 0/O/1/I/L).

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-21 13:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"


def upgrade() -> None:
    op.add_column(
        "invitations",
        sa.Column("code", sa.String(16), nullable=True),
        schema=SCHEMA,
    )
    # Unique constraint on (tenant_id, code) so the same human code can exist
    # in different tenants but never collide inside one. Partial-unique on
    # non-null would be cleaner but Postgres requires that via an index, not a
    # constraint — a plain unique tuple is enough for our scale.
    op.create_index(
        "ix_invitations_tenant_code",
        "invitations",
        ["tenant_id", "code"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("code IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_invitations_tenant_code", table_name="invitations", schema=SCHEMA)
    op.drop_column("invitations", "code", schema=SCHEMA)
