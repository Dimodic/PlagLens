"""add author_label column

Display string for submissions whose author isn't a PlagLens user — chiefly
Yandex.Contest imports that keep participants as external identities (e.g.
``yc:<uid>``) rather than creating user rows in identity-service. Without
this column the UI has nothing to show but the opaque ``author_id``.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-13
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "submission"


def upgrade() -> None:
    op.add_column(
        "submissions",
        sa.Column("author_label", sa.String(length=255), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("submissions", "author_label", schema=SCHEMA)
