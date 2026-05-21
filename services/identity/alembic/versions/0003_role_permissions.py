"""role_permissions table — editable RBAC matrix overrides

Stores one row per (role, permission) once an admin customises the matrix in
the admin UI. Absence of rows for a role => use the static defaults.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-21 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"


def upgrade() -> None:
    op.create_table(
        "role_permissions",
        sa.Column("role", sa.String(32), primary_key=True),
        sa.Column("permission", sa.String(64), primary_key=True),
        sa.Column("granted", sa.Boolean(), nullable=False, server_default=sa.true()),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("role_permissions", schema=SCHEMA)
