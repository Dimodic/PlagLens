"""ORM models — schema=plagiarism."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

# Use JSONB on Postgres, fall back to JSON on SQLite (for tests).
JSONType = JSON().with_variant(JSONB(), "postgresql")


class PlagiarismRun(Base):
    __tablename__ = "plagiarism_runs"
    __table_args__ = (
        Index(
            "ix_runs_idemp",
            "tenant_id",
            "assignment_id",
            "scope_hash",
            "options_hash",
            "status",
        ),
        {"schema": "plagiarism"},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    course_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    assignment_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    scope: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    trigger: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued", index=True)
    options: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    submissions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pairs_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pairs_suspected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    artifact_html_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    artifact_json_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    artifact_archive_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    scope_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    options_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    pairs = relationship("PlagiarismPair", back_populates="run", cascade="all, delete-orphan")
    clusters = relationship("PlagiarismCluster", back_populates="run", cascade="all, delete-orphan")


class PlagiarismPair(Base):
    __tablename__ = "plagiarism_pairs"
    __table_args__ = ({"schema": "plagiarism"},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("plagiarism.plagiarism_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    a_submission_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    b_submission_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    a_author_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    b_author_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    a_author_display_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    b_author_display_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    similarity: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    matched_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fragments: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, nullable=False, default=list)
    cross_course: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cross_assignment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cross_tenant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    run = relationship("PlagiarismRun", back_populates="pairs")


class PlagiarismCluster(Base):
    __tablename__ = "plagiarism_clusters"
    __table_args__ = ({"schema": "plagiarism"},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("plagiarism.plagiarism_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    members: Mapped[list[str]] = mapped_column(JSONType, nullable=False, default=list)
    avg_similarity: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    dominant_language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    run = relationship("PlagiarismRun", back_populates="clusters")


class CorpusEntry(Base):
    __tablename__ = "corpus_entries"
    __table_args__ = ({"schema": "plagiarism"},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    course_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    assignment_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    submission_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    language: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    fingerprints: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProviderConfig(Base):
    __tablename__ = "provider_configs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider", name="uq_provider_per_tenant"),
        {"schema": "plagiarism"},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    default_for_tenant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    credentials_secret_ref: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SuspiciousFlag(Base):
    __tablename__ = "suspicious_flags"
    __table_args__ = ({"schema": "plagiarism"},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    submission_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="low")
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    paired_with: Mapped[list[str]] = mapped_column(JSONType, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cleared_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dismiss_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)


class WebhookSubscription(Base):
    __tablename__ = "webhook_subscriptions"
    __table_args__ = ({"schema": "plagiarism"},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    events: Mapped[list[str]] = mapped_column(JSONType, nullable=False, default=list)
    secret: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
