"""SQLAlchemy ORM models.

The schema for ORM tables is read from env var ``COURSE_DB_SCHEMA`` (default ``course``
on Postgres, ``None`` on SQLite for tests). Tests set ``COURSE_DB_SCHEMA=`` (empty) so
all tables live in the default schema.
"""

from __future__ import annotations

import os
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _resolve_schema() -> str | None:
    raw = os.environ.get("COURSE_DB_SCHEMA")
    if raw is None:
        return "course"
    return raw or None


_SCHEMA = _resolve_schema()


class Base(DeclarativeBase):
    """Declarative base. Schema honoured via metadata when set."""

    metadata = MetaData(schema=_SCHEMA)


def _json_col(default: Any) -> Any:
    return mapped_column(
        JSON().with_variant(JSONB(astext_type=Text()), "postgresql"),
        nullable=False,
        default=default,
    )


# SQLite cannot autoincrement BIGINT — only INTEGER aliases the rowid.
# Use BigInteger on Postgres (real BIGINT) and Integer on SQLite. This
# variant is applied to all surrogate primary keys in this module.
BigIntPK = BigInteger().with_variant(Integer(), "sqlite")


def _utcnow() -> datetime:
    return datetime.now(tz=UTC)


def _fk(table: str) -> str:
    """Build a fully-qualified foreign-key target compatible with both schemas."""

    return f"{_SCHEMA}.{table}" if _SCHEMA else table


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_courses_tenant_slug"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Archive-only lifecycle: "active" | "archived". The legacy "draft"
    # value was migrated to "active" on 2026-05-13.
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False)
    settings: Mapped[dict[str, Any]] = _json_col(default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owners: Mapped[list[CourseOwner]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    members: Mapped[list[CourseMember]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    invitations: Mapped[list[CourseInvitation]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    groups: Mapped[list[Group]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    homeworks: Mapped[list[Homework]] = relationship(
        back_populates="course", cascade="all, delete-orphan", lazy="select"
    )
    assignments: Mapped[list[Assignment]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )


class CourseOwner(Base):
    __tablename__ = "course_owners"

    course_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("courses.id"), ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # owner|co_owner
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    course: Mapped[Course] = relationship(back_populates="owners")


class CourseMember(Base):
    __tablename__ = "course_members"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_course_members_course_user"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("courses.id"), ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # student|assistant
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="members")


class CourseInvitation(Base):
    __tablename__ = "course_invitations"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("courses.id"), ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    max_uses: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="invitations")


class Group(Base):
    __tablename__ = "groups"
    __table_args__ = (UniqueConstraint("course_id", "name", name="uq_groups_course_name"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("courses.id"), ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    settings: Mapped[dict[str, Any]] = _json_col(default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="groups")
    members: Mapped[list[GroupMember]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class GroupMember(Base):
    __tablename__ = "group_members"

    group_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("groups.id"), ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    group: Mapped[Group] = relationship(back_populates="members")


class Homework(Base):
    """Homework — промежуточный уровень между Course и Assignment.

    Группирует связанные задания (обычно одну неделю / тему). Каждое
    Assignment ссылается на Homework через ``homework_id``; Course
    сохраняет ``course_id`` денормализованно для совместимости с RBAC.
    """

    __tablename__ = "homeworks"
    __table_args__ = (
        UniqueConstraint("course_id", "slug", name="uq_homeworks_course_slug"),
        Index("ix_homeworks_course_status", "course_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("courses.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Archive-only lifecycle: "active" | "archived".
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active"
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="homeworks")
    assignments: Mapped[list[Assignment]] = relationship(
        back_populates="homework", lazy="select"
    )


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("course_id", "slug", name="uq_assignments_course_slug"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("courses.id"), ondelete="CASCADE"),
        nullable=False,
    )
    homework_id: Mapped[int | None] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("homeworks.id"), ondelete="RESTRICT"),
        nullable=True,  # nullable до завершения backfill
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    language_hint: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Archive-only lifecycle: "active" | "archived".
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    max_score: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=10)
    weight: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=1)
    deadline_soft_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deadline_hard_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    late_score_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), nullable=False, default=1
    )
    selection_strategy: Mapped[str] = mapped_column(String(16), nullable=False, default="last")
    plagiarism_auto_run: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    plagiarism_threshold: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), nullable=False, default=Decimal("0.6")
    )
    ai_auto_run: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_prompt_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_bindings: Mapped[list[dict[str, Any]]] = _json_col(default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="assignments")
    homework: Mapped[Homework | None] = relationship(back_populates="assignments")
    grading_config: Mapped[AssignmentGradingConfig | None] = relationship(
        back_populates="assignment", cascade="all, delete-orphan", uselist=False
    )
    deadline_extensions: Mapped[list[AssignmentDeadlineExtension]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan"
    )


class AssignmentGradingConfig(Base):
    __tablename__ = "assignment_grading_configs"

    assignment_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("assignments.id"), ondelete="CASCADE"),
        primary_key=True,
    )
    rubric: Mapped[dict[str, Any]] = _json_col(default=dict)
    pass_threshold: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    visible_to_students_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    assignment: Mapped[Assignment] = relationship(back_populates="grading_config")


class AssignmentDeadlineExtension(Base):
    __tablename__ = "assignment_deadline_extensions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "user_id", name="uq_extensions_assignment_user"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    assignment_id: Mapped[int] = mapped_column(
        BigIntPK,
        ForeignKey(_fk("assignments.id"), ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    deadline_soft_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deadline_hard_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    assignment: Mapped[Assignment] = relationship(back_populates="deadline_extensions")


class ProcessedEvent(Base):
    __tablename__ = "processed_events"

    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    consumer_group: Mapped[str] = mapped_column(String(128), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )


__all__ = [
    "Assignment",
    "AssignmentDeadlineExtension",
    "AssignmentGradingConfig",
    "Base",
    "Course",
    "CourseInvitation",
    "CourseMember",
    "CourseOwner",
    "Group",
    "GroupMember",
    "Homework",
    "ProcessedEvent",
]
