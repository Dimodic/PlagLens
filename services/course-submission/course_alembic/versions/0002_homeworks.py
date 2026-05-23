"""Add Homework entity (Course -> Homework -> Assignment).

Adds a new ``homeworks`` table and an optional ``homework_id`` FK on
``assignments``. To keep the migration data-safe, ``assignments.homework_id``
starts ``NULL``; existing rows are then back-filled with a per-course
"Default homework" (slug ``default``, title "Без ДЗ"). The column can be made
``NOT NULL`` later in a follow-up migration.

The data migration is idempotent: ``ON CONFLICT DO NOTHING`` on the homework
insert and ``WHERE homework_id IS NULL`` on the update guard.

Revision ID: 0002_homeworks
Revises: 0001_initial
Create Date: 2026-05-08
"""

from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import op

revision = "0002_homeworks"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _schema() -> str | None:
    raw = os.environ.get("COURSE_DB_SCHEMA")
    if raw is None:
        return "course"
    return raw or None


def _on_postgres() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "postgresql"


def _fk(table: str, schema: str | None) -> str:
    return f"{schema}.{table}" if schema else table


def _qualified(table: str, schema: str | None) -> str:
    return f'"{schema}"."{table}"' if schema else f'"{table}"'


def upgrade() -> None:
    schema = _schema()

    # 1) Create homeworks table.
    op.create_table(
        "homeworks",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("course_id", "slug", name="uq_homeworks_course_slug"),
        sa.ForeignKeyConstraint(
            ["course_id"], [_fk("courses.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )
    op.create_index(
        "ix_homeworks_course_id", "homeworks", ["course_id"], schema=schema
    )
    op.create_index(
        "ix_homeworks_course_status",
        "homeworks",
        ["course_id", "status"],
        schema=schema,
    )

    # 2) Add nullable homework_id to assignments.
    op.add_column(
        "assignments",
        sa.Column("homework_id", sa.BigInteger(), nullable=True),
        schema=schema,
    )
    op.create_foreign_key(
        "fk_assignments_homework_id",
        "assignments",
        "homeworks",
        ["homework_id"],
        ["id"],
        source_schema=schema,
        referent_schema=schema,
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_assignments_homework_id",
        "assignments",
        ["homework_id"],
        schema=schema,
    )

    # 3) Data migration: create one "Default homework" per active course and
    #    backfill assignments.homework_id. Idempotent.
    conn = op.get_bind()
    courses_table = _qualified("courses", schema)
    homeworks_table = _qualified("homeworks", schema)
    assignments_table = _qualified("assignments", schema)

    courses = conn.execute(
        sa.text(f"SELECT id FROM {courses_table} WHERE deleted_at IS NULL")
    ).fetchall()

    is_pg = _on_postgres()

    for (course_id,) in courses:
        if is_pg:
            # PostgreSQL path: ON CONFLICT for idempotency, RETURNING for the new id.
            row = conn.execute(
                sa.text(
                    f"""
                    INSERT INTO {homeworks_table}
                        (course_id, slug, title, position, status, created_at)
                    VALUES (:cid, 'default', 'Без ДЗ', 0, 'published', NOW())
                    ON CONFLICT (course_id, slug) DO NOTHING
                    RETURNING id
                    """
                ),
                {"cid": course_id},
            ).fetchone()
            if row is None:
                # Already inserted in a prior run — look it up.
                row = conn.execute(
                    sa.text(
                        f"SELECT id FROM {homeworks_table} "
                        f"WHERE course_id = :cid AND slug = 'default'"
                    ),
                    {"cid": course_id},
                ).fetchone()
        else:
            # SQLite (tests / dev): no ON CONFLICT in older builds; emulate.
            existing = conn.execute(
                sa.text(
                    f"SELECT id FROM {homeworks_table} "
                    f"WHERE course_id = :cid AND slug = 'default'"
                ),
                {"cid": course_id},
            ).fetchone()
            if existing is None:
                conn.execute(
                    sa.text(
                        f"""
                        INSERT INTO {homeworks_table}
                            (course_id, slug, title, position, status, created_at)
                        VALUES (:cid, 'default', 'Без ДЗ', 0, 'published',
                                CURRENT_TIMESTAMP)
                        """
                    ),
                    {"cid": course_id},
                )
                row = conn.execute(
                    sa.text(
                        f"SELECT id FROM {homeworks_table} "
                        f"WHERE course_id = :cid AND slug = 'default'"
                    ),
                    {"cid": course_id},
                ).fetchone()
            else:
                row = existing

        if row is None:
            continue
        hw_id = row[0]
        conn.execute(
            sa.text(
                f"UPDATE {assignments_table} SET homework_id = :hwid "
                f"WHERE course_id = :cid AND homework_id IS NULL"
            ),
            {"hwid": hw_id, "cid": course_id},
        )


def downgrade() -> None:
    schema = _schema()

    op.drop_index("ix_assignments_homework_id", "assignments", schema=schema)
    op.drop_constraint(
        "fk_assignments_homework_id",
        "assignments",
        type_="foreignkey",
        schema=schema,
    )
    op.drop_column("assignments", "homework_id", schema=schema)

    op.drop_index("ix_homeworks_course_status", "homeworks", schema=schema)
    op.drop_index("ix_homeworks_course_id", "homeworks", schema=schema)
    op.drop_table("homeworks", schema=schema)
