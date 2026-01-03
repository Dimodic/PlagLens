"""ORM models matching alembic 0001_initial.

We intentionally avoid binding tables to a specific PostgreSQL schema at
runtime so the same models work with SQLite-backed tests. The Alembic
migration handles the real schema in production.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, TypeDecorator

from submission_service.models.base import Base


class JsonOrJsonb(TypeDecorator):  # type: ignore[type-arg]
    """JSONB on PostgreSQL, plain JSON on other dialects (SQLite tests)."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    course_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    assignment_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    author_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Display label for submissions whose ``author_id`` is not a PlagLens user
    # (e.g. Yandex.Contest imports where we keep participants as external
    # identities — `yc:<uid>` — instead of creating fake user rows). The UI
    # falls back to this string when identity lookup yields nothing.
    author_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    anon_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    external_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    external_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    total_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    external_verdict: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_score: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    is_late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    late_kind: Mapped[str | None] = mapped_column(String(8), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="received")
    flags: Mapped[dict[str, Any]] = mapped_column(JsonOrJsonb, nullable=False, default=dict)
    selected_for_grading: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    selected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Grader (assistant) this submission is assigned to — set by the
    # teacher's "distribute among assistants" round-robin. ``name`` is
    # denormalised so every list row can show "→ ФИО" without resolving
    # the id against course members on the client.
    assigned_grader_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    assigned_grader_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    files: Mapped[list[SubmissionFile]] = relationship(
        "SubmissionFile",
        back_populates="submission",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    grade: Mapped[SubmissionGrade | None] = relationship(
        "SubmissionGrade",
        back_populates="submission",
        cascade="all, delete-orphan",
        uselist=False,
        lazy="selectin",
    )
    feedbacks: Mapped[list[SubmissionFeedback]] = relationship(
        "SubmissionFeedback",
        back_populates="submission",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    flag_records: Mapped[list[SubmissionFlag]] = relationship(
        "SubmissionFlag",
        back_populates="submission",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "assignment_id", "author_id", "content_hash", name="uq_submission_dedup"
        ),
        UniqueConstraint(
            "source", "external_id", "tenant_id", name="uq_submission_external"
        ),
        Index("ix_submissions_tenant_assignment", "tenant_id", "assignment_id"),
        Index("ix_submissions_author_assignment", "author_id", "assignment_id"),
    )


class SubmissionFile(Base):
    __tablename__ = "submission_files"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    storage_uri: Mapped[str] = mapped_column(String(2048), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    submission: Mapped[Submission] = relationship("Submission", back_populates="files")


class SubmissionGrade(Base):
    __tablename__ = "submission_grades"

    submission_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    score: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    max_score: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    applied_multiplier: Mapped[float] = mapped_column(
        Numeric(6, 3), nullable=False, default=1.0
    )
    graded_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    comment_visible_to_student: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # Teacher's free-text note attached to the grade. Visibility to the
    # student is gated by ``comment_visible_to_student`` above.
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    history: Mapped[list[dict[str, Any]]] = mapped_column(
        JsonOrJsonb, nullable=False, default=list
    )

    submission: Mapped[Submission] = relationship("Submission", back_populates="grade")


class SubmissionGradeHistory(Base):
    __tablename__ = "submission_grade_history"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    submission_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    score: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    applied_multiplier: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    graded_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    graded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class SubmissionFeedback(Base):
    __tablename__ = "submission_feedback"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[str] = mapped_column(String(64), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    visible_to_student: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    submission: Mapped[Submission] = relationship("Submission", back_populates="feedbacks")


class SubmissionFlag(Base):
    __tablename__ = "submission_flags"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    set_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    submission: Mapped[Submission] = relationship("Submission", back_populates="flag_records")


class ProcessedEvent(Base):
    __tablename__ = "processed_events"

    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    consumer_group: Mapped[str] = mapped_column(String(128), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Operation(Base):
    __tablename__ = "operations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    progress: Mapped[dict[str, Any]] = mapped_column(JsonOrJsonb, nullable=False, default=dict)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata_", JsonOrJsonb, nullable=False, default=dict
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[dict[str, Any] | None] = mapped_column(JsonOrJsonb, nullable=True)
