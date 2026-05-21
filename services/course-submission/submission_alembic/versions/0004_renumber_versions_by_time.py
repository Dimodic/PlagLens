"""renumber submission.version by submitted_at order

Version numbers are assigned ``max_version + 1`` per author as rows are
created, so the import order *was* the version order. Bulk imports
(Yandex.Contest etc.) often arrive newest-first, which numbered the
freshest attempt v1 and the oldest vN — the reverse of what the UI and
``list_latest_per_student`` expect.

The importer is fixed to sort chronologically going forward; this
migration repairs the rows already in the table. Per
``(assignment_id, author_id)`` group, versions are reassigned 1..N
ordered by ``submitted_at`` ascending (``id`` as a stable tie-breaker),
so v1 is the earliest attempt and the highest version is the latest.

Idempotent: re-running it just re-derives the same numbering.

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-14
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "submission"


def upgrade() -> None:
    # Window-function renumbering — one UPDATE, no Python loop. The
    # ROW_NUMBER partition mirrors the (assignment_id, author_id) version
    # scope; ordering by submitted_at then id gives a deterministic 1..N.
    op.execute(
        f"""
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY assignment_id, author_id
                    ORDER BY submitted_at ASC, id ASC
                ) AS new_version
            FROM {SCHEMA}.submissions
        )
        UPDATE {SCHEMA}.submissions s
        SET version = ranked.new_version
        FROM ranked
        WHERE s.id = ranked.id
          AND s.version IS DISTINCT FROM ranked.new_version
        """
    )


def downgrade() -> None:
    # No-op: the original (import-order) numbering carried no real
    # information and isn't worth reconstructing — the time-ordered
    # numbering this migration produces is strictly more correct.
    pass
