"""SQLAlchemy ORM models for AI Analysis Service.

Tables live in the ``ai_analysis`` Postgres schema. The schema is configured
via ``DATABASE_SCHEMA`` and is unset for the SQLite test bind (where schemas
are unsupported); ``alembic env.py`` picks the schema up at migration time.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

_schema = get_settings().DATABASE_SCHEMA


class Base(DeclarativeBase):
    metadata = MetaData(schema=_schema, naming_convention=NAMING_CONVENTION)


# --- JSON column compatible with SQLite (tests) and Postgres (prod) ----
def _json_column(*, nullable: bool = True, default_factory=None):
    """Return a JSONB column that falls back to JSON for SQLite tests."""
    from sqlalchemy import JSON

    json_type = JSONB().with_variant(JSON(), "sqlite")
    # default_factory accepted for parity with future Postgres-only defaults;
    # SQLite doesn't accept the postgres jsonb default literal.
    _ = default_factory
    return mapped_column(json_type, nullable=nullable)


class PromptVersion(Base):
    __tablename__ = "prompt_versions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    user_template: Mapped[str] = mapped_column(Text, nullable=False)
    json_schema: Mapped[dict[str, Any]] = _json_column(nullable=False)
    active_for_tenant: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_prompt_versions_tenant_active", "tenant_id", "active_for_tenant"),
    )


class ProviderConfig(Base):
    __tablename__ = "provider_configs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Staff user who connected this provider (per-user "bring your own key").
    # NULL = tenant/admin-level config: fallback when the actor has no personal
    # provider, and the source for the column-matcher assist.
    owner_user_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    # Vault / KV path for the API key (preferred for prod). Read at request time.
    api_key_secret_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Alternative: name of an environment variable (e.g. ``OPENROUTER_API_KEY``).
    # The actual key value is **never** stored in the database — only the var name.
    api_key_env_var: Mapped[str | None] = mapped_column(String(200), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    default_for_tenant: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    rate_limit_rpm: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=8192)
    supports_json_schema: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    settings: Mapped[dict[str, Any] | None] = _json_column(nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_provider_configs_tenant_priority", "tenant_id", "priority"),
    )


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    course_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    assignment_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    submission_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    prompt_version: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(200), nullable=False)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    trigger: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")

    cache_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    report: Mapped[dict[str, Any] | None] = _json_column(nullable=True)
    raw_llm_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    injection_suspected: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_estimate: Mapped[Decimal] = mapped_column(
        Numeric(14, 6), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    parent_analysis_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    shared_with_student: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    curated_feedback_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_ai_analyses_submission_status", "submission_id", "status"),
    )


class BudgetConfig(Base):
    __tablename__ = "budget_configs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    scope_id: Mapped[str] = mapped_column(String(64), nullable=False)
    period: Mapped[str] = mapped_column(String(16), nullable=False)
    max_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    max_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 6), nullable=True)
    soft_warn_at: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, default=Decimal("0.8")
    )
    hard_stop_at: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, default=Decimal("1.0")
    )
    reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("scope", "scope_id", name="uq_budget_scope"),)


class BudgetUsage(Base):
    __tablename__ = "budget_usages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    scope_id: Mapped[str] = mapped_column(String(64), nullable=False)
    period: Mapped[str] = mapped_column(String(16), nullable=False)
    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    rolling: Mapped[dict[str, Any] | None] = _json_column(nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 6), nullable=False, default=Decimal("0")
    )
    analyses_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_hits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_warned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "scope", "scope_id", "period", "period_start", name="uq_budget_usage_period"
        ),
    )


class ProcessedEvent(Base):
    __tablename__ = "processed_events"

    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    consumer_group: Mapped[str] = mapped_column(String(128), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


__all__ = [
    "Base",
    "AIAnalysis",
    "PromptVersion",
    "ProviderConfig",
    "BudgetConfig",
    "BudgetUsage",
    "ProcessedEvent",
]
