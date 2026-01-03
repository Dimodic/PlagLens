"""ORM entities for the integration service."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from integration_service.models.base import Base


class IntegrationConfig(Base):
    __tablename__ = "integration_configs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending_auth")
    credentials_secret_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    cursor: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_sync_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    jobs: Mapped[list[ImportJob]] = relationship(
        back_populates="config", cascade="all, delete-orphan"
    )
    schedules: Mapped[list[SyncSchedule]] = relationship(
        back_populates="config", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_integration_configs_tenant_kind", "tenant_id", "kind"),
        Index("ix_integration_configs_course", "course_id"),
    )


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    integration_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("integration_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scope: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    trigger: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    progress: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    stats: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    error: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    config: Mapped[IntegrationConfig] = relationship(back_populates="jobs")


class SyncSchedule(Base):
    __tablename__ = "sync_schedules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    integration_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("integration_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    cron: Mapped[str] = mapped_column(String(128), nullable=False)
    scope: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    config: Mapped[IntegrationConfig] = relationship(back_populates="schedules")


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    integration_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    tenant_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    external_event_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    payload_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    signature_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    raw_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_payload_uri: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="received")
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_webhook_events_kind_status", "kind", "status"),
        UniqueConstraint("kind", "external_event_id", name="uq_webhook_external_event"),
    )


class TelegramBinding(Base):
    __tablename__ = "telegram_bindings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    chat_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    verification_token: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, unique=True
    )
    bound_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class GoogleSheetsLink(Base):
    __tablename__ = "google_sheets_links"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    spreadsheet_id: Mapped[str] = mapped_column(String(128), nullable=False)
    sheet_name: Mapped[str] = mapped_column(String(128), nullable=False)
    columns_mapping: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProcessedEvent(Base):
    """Idempotency table for Kafka consumers."""

    __tablename__ = "processed_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    consumer_group: Mapped[str] = mapped_column(String(64), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class OAuthAppCredentials(Base):
    """Admin-managed global OAuth client credentials (one row per tenant +
    provider). Looked up by `services/oauth.py:get_provider` before falling
    back to the `.env.local` defaults. Lets the admin paste their PlagLens
    OAuth app's client_id + client_secret through the UI without restarting
    the integration service."""

    __tablename__ = "oauth_app_credentials"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "provider_kind", name="uq_oauth_creds_tenant_provider"
        ),
        Index("ix_oauth_creds_tenant", "tenant_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    client_id: Mapped[str] = mapped_column(String(255), nullable=False)
    client_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    scope: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
