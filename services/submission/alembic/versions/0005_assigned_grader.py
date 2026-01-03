"""add assigned_grader_id / assigned_grader_name to submissions

The teacher's "distribute among assistants" action round-robins a
course's (or assignment's) submissions across its assistants. Each
submission records which grader it landed on. The grader's display
name is denormalised alongside the id so list rows can show "→ ФИО"
without a per-row lookup against course members.

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "submission"


def upgrade() -> None:
    op.add_column(
        "submissions",
        sa.Column("assigned_grader_id", sa.String(64), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "submissions",
        sa.Column("assigned_grader_name", sa.String(255), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_submissions_assigned_grader_id",
        "submissions",
        ["assigned_grader_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_submissions_assigned_grader_id",
        table_name="submissions",
        schema=SCHEMA,
    )
    op.drop_column("submissions", "assigned_grader_name", schema=SCHEMA)
    op.drop_column("submissions", "assigned_grader_id", schema=SCHEMA)
