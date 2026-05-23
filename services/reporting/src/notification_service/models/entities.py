"""Entities for notification service.

Schema = ``notification``. The JSONB type is used on Postgres; for sqlite tests
we fall back to plain ``JSON`` via the dialect-aware ``JSON_T`` alias.
"""
from __future__ import annotations

import itertools
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from notification_service.models.base import SCHEMA, Base

# Use JSONB on Postgres; JSON elsewhere (sqlite for tests).
JSON_T = JSONB().with_variant(JSON(), "sqlite")
MutableJSON = MutableDict.as_mutable(JSON_T)


# Process-wide counter used as a fallback "seq" generator. On Postgres the
# alembic migration installs a unique constraint on this column and the
# client-side default lands in the INSERT — so the counter MUST start above
# any seq value that ever existed in this database. We seed it from the wall
# clock in milliseconds: any second-process / restart starts strictly higher
# than the previous run's last issued seq, eliminating duplicate-key crashes
# after make-reset cycles or container restarts.
import time as _time  # noqa: E402  (kept here for proximity to the comment block above)

_seq_counter = itertools.count(int(_time.time() * 1000))


def _next_seq() -> int:
    return next(_seq_counter)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", "created_at"),
        Index("ix_notifications_user_unread", "user_id", "read_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    action_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata_", MutableJSON, nullable=False, default=dict
    )
    channels_attempted: Mapped[dict[str, Any]] = mapped_column(
        MutableJSON, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Monotonic delivery sequence per row. Postgres production uses the Identity
    # column from the alembic migration; in ORM-only test setups (SQLite, where
    # autoincrement on a non-PK BigInteger isn't supported) we fall back to a
    # process-wide Python counter via the default callable.
    seq: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer(), "sqlite"),
        nullable=False,
        unique=True,
        default=_next_seq,
    )

    deliveries: Mapped[list[NotificationDelivery]] = relationship(
        "NotificationDelivery",
        back_populates="notification",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    notification_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey(f"{SCHEMA}.notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    notification: Mapped[Notification] = relationship("Notification", back_populates="deliveries")


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = ({"schema": SCHEMA},)

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    channels_enabled: Mapped[dict[str, Any]] = mapped_column(
        MutableJSON,
        nullable=False,
        default=lambda: {"inapp": True, "email": True, "telegram": False},
    )
    email_digest_frequency: Mapped[str] = mapped_column(
        String(16), nullable=False, default="instant"
    )
    per_event: Mapped[dict[str, Any]] = mapped_column(MutableJSON, nullable=False, default=dict)
    quiet_hours_start: Mapped[str | None] = mapped_column(String(8), nullable=True)
    quiet_hours_end: Mapped[str | None] = mapped_column(String(8), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    locale: Mapped[str] = mapped_column(String(8), nullable=False, default="ru")
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email_disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    telegram_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class NotificationTemplate(Base):
    __tablename__ = "notification_templates"
    __table_args__ = (
        UniqueConstraint(
            "event_type",
            "locale",
            "channel",
            "version",
            name="uq_template_etype_locale_channel_version",
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    locale: Mapped[str] = mapped_column(String(8), nullable=False, default="ru")
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    subject_template: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_template: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EmailTransportConfig(Base):
    __tablename__ = "email_transport_config"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False, default="mailgun")
    api_key_secret_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    from_email: Mapped[str] = mapped_column(String(320), nullable=False)
    from_name: Mapped[str] = mapped_column(String(128), nullable=False, default="PlagLens")
    reply_to: Mapped[str | None] = mapped_column(String(320), nullable=True)
    dns_validated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_for_tenant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class WebPushSubscription(Base):
    __tablename__ = "web_push_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "endpoint", name="uq_webpush_user_endpoint"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    keys: Mapped[dict[str, Any]] = mapped_column(MutableJSON, nullable=False, default=dict)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EmailBounce(Base):
    __tablename__ = "email_bounces"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="hard")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProcessedEvent(Base):
    __tablename__ = "processed_events"
    __table_args__ = ({"schema": SCHEMA},)

    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    consumer_group: Mapped[str] = mapped_column(String(128), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TelegramBotConfig(Base):
    __tablename__ = "telegram_bot_config"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    token_secret_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bot_username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
