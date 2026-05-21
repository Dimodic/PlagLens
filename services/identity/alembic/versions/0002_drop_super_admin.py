"""drop super_admin role: merge existing super_admin users into admin

``super_admin`` is removed as a distinct global role. ``admin`` becomes the
single cross-tenant top role (it absorbs super_admin's powers). Any user that
still carries ``global_role='super_admin'`` is migrated to ``admin`` so they
keep access, and the bootstrap account's legacy display name is normalised.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-21 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"


def upgrade() -> None:
    op.execute(
        f"UPDATE {SCHEMA}.users SET global_role = 'admin' "
        f"WHERE global_role = 'super_admin'"
    )
    op.execute(
        f"UPDATE {SCHEMA}.users SET display_name = 'Admin' "
        f"WHERE display_name = 'System Super Admin'"
    )


def downgrade() -> None:
    # Not reversible — we cannot tell which admins were formerly super_admin.
    pass
