"""add comment column to submission_grades

The grade form has always accepted a free-text comment from the teacher,
but the backend silently dropped it — neither GradeIn nor SubmissionGrade
had a field for it, so the value sent by the UI never reached the DB.
This adds the column so the saved grade actually carries the comment.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "submission"


def upgrade() -> None:
    op.add_column(
        "submission_grades",
        sa.Column("comment", sa.Text(), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("submission_grades", "comment", schema=SCHEMA)
