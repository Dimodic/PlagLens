"""widen submissions.external_verdict to varchar(64)

The column was ``varchar(16)`` — fine while ``external_verdict`` was
never populated. Once the importer started carrying the remote judge's
verdict through, real Yandex.Contest values overflowed it
("PresentationError" = 17, "TimeLimitExceeded" = 17,
"MemoryLimitExceeded" = 19), failing the whole batchImport with a
StringDataRightTruncationError. 64 chars covers any judge verdict.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "submission"


def upgrade() -> None:
    op.alter_column(
        "submissions",
        "external_verdict",
        type_=sa.String(64),
        existing_type=sa.String(16),
        existing_nullable=True,
        schema=SCHEMA,
    )


def downgrade() -> None:
    # Lossy if any row already holds a >16-char verdict; truncate first
    # so the type change can't fail.
    op.execute(
        f"UPDATE {SCHEMA}.submissions "
        f"SET external_verdict = left(external_verdict, 16) "
        f"WHERE length(external_verdict) > 16"
    )
    op.alter_column(
        "submissions",
        "external_verdict",
        type_=sa.String(16),
        existing_type=sa.String(64),
        existing_nullable=True,
        schema=SCHEMA,
    )
