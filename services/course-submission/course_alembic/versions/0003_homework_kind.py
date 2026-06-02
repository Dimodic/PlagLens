"""Add ``homeworks.kind`` — «single» vs «collection».

A «single» ДЗ is the task itself (one auto-created assignment carrying the
same title); a «collection» groups several separate tasks. Making this a
first-class column lets the UI render a single ДЗ as a leaf (no nested
self-duplicate, no doubled breadcrumb) instead of guessing it from a title
match.

Backfill: existing homeworks created via the simple-ДЗ modal have exactly ONE
assignment whose title equals the homework title — mark those ``single``.
The synthetic ``default`` homework (slug ``default``, holds orphan imports) is
left ``collection``. Idempotent.

Revision ID: 0003_homework_kind
Revises: 0002_homeworks
Create Date: 2026-06-02
"""

from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import op

revision = "0003_homework_kind"
down_revision = "0002_homeworks"
branch_labels = None
depends_on = None


def _schema() -> str | None:
    raw = os.environ.get("COURSE_DB_SCHEMA")
    if raw is None:
        return "course"
    return raw or None


def _qualified(table: str, schema: str | None) -> str:
    return f'"{schema}"."{table}"' if schema else f'"{table}"'


def upgrade() -> None:
    schema = _schema()

    op.add_column(
        "homeworks",
        sa.Column(
            "kind",
            sa.String(16),
            nullable=False,
            server_default="collection",
        ),
        schema=schema,
    )

    # Backfill: homeworks with exactly one assignment whose title matches the
    # homework title are the auto-created «simple ДЗ». Mark them 'single'.
    conn = op.get_bind()
    homeworks_table = _qualified("homeworks", schema)
    assignments_table = _qualified("assignments", schema)
    conn.execute(
        sa.text(
            f"""
            UPDATE {homeworks_table} SET kind = 'single'
            WHERE id IN (
                SELECT a.homework_id
                FROM {assignments_table} a
                JOIN {homeworks_table} h ON h.id = a.homework_id
                WHERE h.slug <> 'default'
                GROUP BY a.homework_id, h.title
                HAVING COUNT(*) = 1 AND MAX(a.title) = h.title
            )
            """
        )
    )


def downgrade() -> None:
    schema = _schema()
    op.drop_column("homeworks", "kind", schema=schema)
