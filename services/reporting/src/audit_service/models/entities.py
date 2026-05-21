"""Entities for the audit service.

AuditEvent is partitioned BY RANGE (recorded_at) on PostgreSQL. The DDL
``postgresql_partition_by`` argument is honored only by the PG dialect; on
SQLite (used by tests) the argument is ignored and the table behaves like a
regular table.

Append-only is enforced at DB-level: the runtime DB user has only
``INSERT/SELECT`` rights on ``audit_events`` (see README §Database hardening).
The ORM never issues UPDATE or DELETE statements against AuditEvent.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    CHAR,
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON, TypeDecorator

from .base import SCHEMA, Base


class JSONType(TypeDecorator):
    """JSONB on PostgreSQL, JSON elsewhere (SQLite, etc)."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB(astext_type=Text()))
        return dialect.type_descriptor(JSON())


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_tenant_recorded", "tenant_id", "recorded_at"),
        Index("ix_audit_events_action_recorded", "action", "recorded_at"),
        Index("ix_audit_events_actor", "actor_id"),
        Index(
            "ix_audit_events_resource",
            "resource_type",
            "resource_id",
        ),
        Index("ix_audit_events_request_id", "request_id"),
        UniqueConstraint("event_id", "recorded_at", name="uq_audit_events_event_id"),
        {
            "schema": SCHEMA,
            "postgresql_partition_by": "RANGE (recorded_at)",
        },
    )

    # ULID primary key (CHAR(26)). Composite with recorded_at for partitioning.
    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, default=_utcnow, index=True
    )

    # Original CloudEvents id (for deduplication of Kafka redelivery).
    event_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    tenant_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    # Actor (denormalized columns for fast filter + JSON for full payload).
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False, default="user")
    actor_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actor: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)

    action: Mapped[str] = mapped_column(String(128), nullable=False)
    result: Mapped[str] = mapped_column(String(16), nullable=False, default="success")

    # Resource.
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)

    source_service: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    before: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONType, default=dict, nullable=False
    )

    retention_class: Mapped[str] = mapped_column(
        String(32), nullable=False, default="default"
    )


class RetentionPolicy(Base):
    __tablename__ = "retention_policies"
    __table_args__ = (
        UniqueConstraint("scope", "scope_id", name="uq_retention_scope"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False, default="tenant")
    scope_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=365)
    long_retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=2555)
    legal_hold_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


class LegalHold(Base):
    __tablename__ = "legal_holds"
    __table_args__ = (
        Index("ix_legal_holds_resource", "resource_type", "resource_id"),
        Index("ix_legal_holds_tenant_active", "tenant_id", "ended_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ProcessedEvent(Base):
    """Idempotency for Kafka consumer (`processed_events` per 03-EVENTS.md)."""

    __tablename__ = "processed_events"
    __table_args__ = ({"schema": SCHEMA},)

    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    consumer_group: Mapped[str] = mapped_column(String(128), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
