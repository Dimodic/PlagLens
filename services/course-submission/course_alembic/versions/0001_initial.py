"""Initial schema for course service.

Tables live in schema ``course`` on Postgres (default) and in the unnamed default
schema on SQLite — chosen via the ``COURSE_DB_SCHEMA`` env var. Same logic is used
by the ORM in :mod:`course_service.models`.

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-01
"""

from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


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


def upgrade() -> None:
    schema = _schema()
    if _on_postgres() and schema:
        op.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')

    op.create_table(
        "courses",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("settings", JSON_TYPE, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_courses_tenant_slug"),
        schema=schema,
    )
    op.create_index(
        "ix_courses_tenant_status", "courses", ["tenant_id", "status"], schema=schema
    )

    op.create_table(
        "course_owners",
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("course_id", "user_id", name="pk_course_owners"),
        sa.ForeignKeyConstraint(
            ["course_id"], [_fk("courses.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )

    op.create_table(
        "course_members",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "course_id", "user_id", name="uq_course_members_course_user"
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], [_fk("courses.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )

    op.create_table(
        "course_invitations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("code", name="uq_course_invitations_code"),
        sa.ForeignKeyConstraint(
            ["course_id"], [_fk("courses.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )

    op.create_table(
        "groups",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("settings", JSON_TYPE, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("course_id", "name", name="uq_groups_course_name"),
        sa.ForeignKeyConstraint(
            ["course_id"], [_fk("courses.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )

    op.create_table(
        "group_members",
        sa.Column("group_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("group_id", "user_id", name="pk_group_members"),
        sa.ForeignKeyConstraint(
            ["group_id"], [_fk("groups.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )

    op.create_table(
        "assignments",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("language_hint", sa.String(32), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("max_score", sa.Numeric(10, 2), nullable=False, server_default="10"),
        sa.Column("weight", sa.Numeric(10, 4), nullable=False, server_default="1"),
        sa.Column("deadline_soft_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deadline_hard_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "late_score_multiplier", sa.Numeric(5, 4), nullable=False, server_default="1"
        ),
        sa.Column("selection_strategy", sa.String(16), nullable=False, server_default="last"),
        sa.Column(
            "plagiarism_auto_run", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "plagiarism_threshold", sa.Numeric(5, 4), nullable=False, server_default="0.6"
        ),
        sa.Column("ai_auto_run", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ai_prompt_version", sa.String(64), nullable=True),
        sa.Column(
            "external_bindings", JSON_TYPE, nullable=False, server_default=sa.text("'[]'")
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("course_id", "slug", name="uq_assignments_course_slug"),
        sa.ForeignKeyConstraint(
            ["course_id"], [_fk("courses.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )
    op.create_index(
        "ix_assignments_course_status",
        "assignments",
        ["course_id", "status"],
        schema=schema,
    )

    op.create_table(
        "assignment_grading_configs",
        sa.Column("assignment_id", sa.BigInteger(), primary_key=True),
        sa.Column("rubric", JSON_TYPE, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("pass_threshold", sa.Numeric(5, 2), nullable=True),
        sa.Column("visible_to_students_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["assignment_id"], [_fk("assignments.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )

    op.create_table(
        "assignment_deadline_extensions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("assignment_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("deadline_soft_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deadline_hard_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "assignment_id", "user_id", name="uq_extensions_assignment_user"
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"], [_fk("assignments.id", schema)], ondelete="CASCADE"
        ),
        schema=schema,
    )

    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.String(128), primary_key=True),
        sa.Column("consumer_group", sa.String(128), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False),
        schema=schema,
    )


def downgrade() -> None:
    schema = _schema()
    for table in (
        "processed_events",
        "assignment_deadline_extensions",
        "assignment_grading_configs",
        "assignments",
        "group_members",
        "groups",
        "course_invitations",
        "course_members",
        "course_owners",
        "courses",
    ):
        op.drop_table(table, schema=schema)
    if _on_postgres() and schema:
        op.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
