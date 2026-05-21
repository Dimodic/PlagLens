"""Pydantic v2 schemas for API."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

ChannelLit = Literal["inapp", "email", "telegram"]
SeverityLit = Literal["info", "success", "warning", "error"]
DigestFreqLit = Literal["instant", "hourly", "daily", "never"]


class Pagination(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int = 50


class Page(BaseModel):
    data: list[Any]
    pagination: Pagination


# ---- Notification ----

class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    user_id: str
    event_id: str | None = None
    event_type: str
    source: str | None = None
    title: str
    body: str
    action_url: str | None = None
    severity: SeverityLit = "info"
    metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata_")
    channels_attempted: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    read_at: datetime | None = None
    archived_at: datetime | None = None
    seq: int


class NotificationPatch(BaseModel):
    read: bool | None = None
    archived: bool | None = None


class IdsBody(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class UnreadCountOut(BaseModel):
    unread: int


# ---- Preferences ----

class QuietHours(BaseModel):
    start: str | None = None  # "22:00"
    end: str | None = None  # "07:00"
    timezone: str = "UTC"


class PreferencesOut(BaseModel):
    user_id: str
    channels_enabled: dict[str, bool]
    email_digest_frequency: DigestFreqLit = "instant"
    per_event: dict[str, dict[str, bool]] = Field(default_factory=dict)
    quiet_hours: QuietHours = Field(default_factory=QuietHours)
    locale: str = "ru"
    email: str | None = None
    telegram_chat_id: str | None = None
    email_disabled: bool = False
    telegram_revoked: bool = False


class PreferencesPatch(BaseModel):
    channels_enabled: dict[str, bool] | None = None
    email_digest_frequency: DigestFreqLit | None = None
    quiet_hours: QuietHours | None = None
    locale: str | None = None
    email: EmailStr | None = None
    telegram_chat_id: str | None = None


class PerEventPatch(BaseModel):
    per_event: dict[str, dict[str, bool]]


class AvailableEventOut(BaseModel):
    event_type: str
    description: str
    default_channels: dict[str, bool]


# ---- Test ----

class TestSendBody(BaseModel):
    channel: ChannelLit = "inapp"
    template: str = "test"
    title: str | None = None
    body: str | None = None


class TestBroadcastBody(BaseModel):
    title: str = "Broadcast Test"
    body: str = "This is a test broadcast"


# ---- Templates ----

class TemplateIn(BaseModel):
    event_type: str
    locale: str = "ru"
    channel: ChannelLit
    subject_template: str = ""
    body_template: str
    active: bool = True
    version: int = 1


class TemplatePatch(BaseModel):
    subject_template: str | None = None
    body_template: str | None = None
    active: bool | None = None
    version: int | None = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type: str
    locale: str
    channel: str
    subject_template: str
    body_template: str
    active: bool
    version: int
    created_at: datetime


class TemplatePreviewBody(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


class TemplatePreviewOut(BaseModel):
    subject: str
    body: str


# ---- Email transport ----

class EmailConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str | None
    provider: str
    api_key_secret_ref: str | None
    from_email: str
    from_name: str
    reply_to: str | None
    dns_validated: bool
    default_for_tenant: bool
    updated_at: datetime


class EmailConfigPatch(BaseModel):
    provider: str | None = None
    api_key_secret_ref: str | None = None
    from_email: EmailStr | None = None
    from_name: str | None = None
    reply_to: EmailStr | None = None
    default_for_tenant: bool | None = None


class DnsStatusOut(BaseModel):
    spf: bool
    dkim: bool
    dmarc: bool
    checked_at: datetime


class BounceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None
    email: str
    kind: str
    reason: str | None
    received_at: datetime


# ---- Telegram ----

class TelegramConfigOut(BaseModel):
    id: str
    bot_username: str | None
    webhook_url: str | None
    token_present: bool
    updated_at: datetime


class TelegramConfigPatch(BaseModel):
    token_secret_ref: str | None = None
    bot_username: str | None = None


class TelegramSetWebhookBody(BaseModel):
    webhook_url: str


# ---- Web Push ----

class WebPushSubscribeBody(BaseModel):
    endpoint: str
    keys: dict[str, str] = Field(default_factory=dict)
    user_agent: str | None = None


class WebPushOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    endpoint: str
    keys: dict[str, str]
    user_agent: str | None
    created_at: datetime


class VapidKeyOut(BaseModel):
    public_key: str


# ---- Digest ----

class DigestPreviewOut(BaseModel):
    user_id: str
    period_hours: int
    notifications: list[NotificationOut]
    count: int


# ---- Admin observability ----

class DeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    notification_id: str
    channel: str
    status: str
    error: str | None
    attempted_at: datetime
    delivered_at: datetime | None
    retry_count: int


class StatsOut(BaseModel):
    period: str
    by_channel: dict[str, dict[str, int]]
    delivery_rate: dict[str, float]
    total: int
