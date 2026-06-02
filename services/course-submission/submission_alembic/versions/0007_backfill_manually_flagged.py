"""backfill submissions.flags["manually_flagged"] from flag rows

A manual review flag lived in two disconnected places: a row in
``submission_flags`` (written by the human flag endpoint) and the JSON
``submissions.flags`` dict (read by the triage "помечено" filter and the
row badge, both of which check ``flags["manually_flagged"]``). The flag
endpoint set ``flags[kind]`` but never ``flags["manually_flagged"]``, so
manually flagged submissions never surfaced in triage.

The service layer now keeps ``manually_flagged`` in sync on flag/unflag.
This migration backfills the marker for submissions that already carry an
active (non-cleared) flag row, so pre-existing manual flags show up
without needing to be re-applied.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-02
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "submission"


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE {SCHEMA}.submissions s
        SET flags = jsonb_set(
            coalesce(s.flags, '{{}}'::jsonb),
            '{{manually_flagged}}',
            'true'::jsonb
        )
        WHERE EXISTS (
            SELECT 1 FROM {SCHEMA}.submission_flags f
            WHERE f.submission_id = s.id AND f.cleared_at IS NULL
        )
        AND coalesce((s.flags ->> 'manually_flagged')::boolean, false) = false
        """
    )


def downgrade() -> None:
    # Forward-only backfill: the marker is harmless and is now maintained
    # by the service layer, so there is nothing to reverse.
    pass
