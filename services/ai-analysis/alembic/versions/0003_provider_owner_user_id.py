"""Add ``owner_user_id`` to ``provider_configs``.

Per-user AI provider connections: a teacher/assistant connects their own
provider + key in course Integrations. ``owner_user_id`` is the staff user who
owns the config; it's used to resolve the provider by the *actor* running an
analysis. ``NULL`` keeps the legacy meaning — a tenant/admin-level config used
as the fallback (and for the column-matcher assist).

Revision ID: 0003_provider_owner_user_id
Revises: 0002_provider_api_key_env_var
Create Date: 2026-05-31
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_provider_owner_user_id"
down_revision: str | None = "0002_provider_api_key_env_var"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "ai_analysis"


def upgrade() -> None:
    op.add_column(
        "provider_configs",
        sa.Column("owner_user_id", sa.String(64), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_provider_configs_owner_user_id",
        "provider_configs",
        ["owner_user_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_provider_configs_owner_user_id",
        table_name="provider_configs",
        schema=SCHEMA,
    )
    op.drop_column("provider_configs", "owner_user_id", schema=SCHEMA)
