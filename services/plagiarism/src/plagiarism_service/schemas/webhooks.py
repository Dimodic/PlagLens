"""Webhook subscription schemas (§H)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


class WebhookSubscriptionCreate(BaseModel):
    url: HttpUrl
    events: list[str] = Field(default_factory=list, min_length=1)
    secret: str | None = Field(default=None, min_length=8, max_length=128)


class WebhookSubscriptionItem(BaseModel):
    id: str
    url: str
    events: list[str]
    enabled: bool
    created_at: datetime
    created_by: str | None = None
