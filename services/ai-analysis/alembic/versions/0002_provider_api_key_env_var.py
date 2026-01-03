"""Add ``api_key_env_var`` column to ``provider_configs``.

Stores the *name* of an environment variable from which the API key is read
at request time. The value itself never lives in the database. Together
with ``api_key_secret_ref`` (Vault path), this lets ProviderConfig rows be
seeded without exposing credentials in DB dumps.

Revision ID: 0002_provider_api_key_env_var
Revises: 0001_initial
Create Date: 2026-05-07
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_provider_api_key_env_var"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "ai_analysis"


def upgrade() -> None:
    op.add_column(
        "provider_configs",
        sa.Column("api_key_env_var", sa.String(200), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("provider_configs", "api_key_env_var", schema=SCHEMA)
