"""Webhook event schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class WebhookEventOut(BaseModel):
    id: str
    integration_id: Optional[str]
    tenant_id: Optional[str]
    kind: str
    external_event_id: Optional[str]
    signature_valid: bool
    received_at: datetime
    processed_at: Optional[datetime]
    status: str

    class Config:
        from_attributes = True
