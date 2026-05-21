"""Internal HTTP endpoint used by Identity Service for transactional emails
(verification, password reset). Sync feedback when SMTP/Mailgun is down.

Authentication: shared bearer secret expected via ``Authorization`` header
(``Bearer <NOTIFICATION_INTERNAL_TOKEN>``). When ``AUTH_DISABLED`` is set
(local dev / tests) the check is skipped — the same convention used by other
internal endpoints in this service.

For non-transactional or out-of-band events, services should publish
``identity.email.send_requested.v1`` to Kafka and let
:class:`KafkaDispatcher` drive the standard fan-out path. We use HTTP here
specifically because Identity wants synchronous feedback.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.channels import DeliveryRequest
from notification_service.config import get_settings
from notification_service.db import get_db
from notification_service.delivery import create_notification, get_channels
from notification_service.errors import Problem
from notification_service.templates_engine import render_string

router = APIRouter(tags=["internal-notifications"])


class EmailDirectBody(BaseModel):
    user_id: str
    tenant_id: str
    recipient: EmailStr
    subject: str
    body_html: str
    body_text: str | None = None
    template_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    event_type: str = "identity.email.transactional.v1"
    severity: str = "info"


def _check_internal_auth(
    request: Request,
    authorization: str | None,
) -> None:
    s = get_settings()
    if s.AUTH_DISABLED:
        return
    expected = getattr(s, "NOTIFICATION_INTERNAL_TOKEN", None) or None
    if not expected:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Problem(401, "UNAUTHENTICATED", "Bearer token required")
    if authorization[7:].strip() != expected:
        raise Problem(401, "UNAUTHENTICATED", "Invalid internal token")


@router.post("/internal/notifications/email-direct")
async def email_direct(
    body: EmailDirectBody,
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _check_internal_auth(request, authorization)

    # Allow Jinja substitution in subject/body if context supplied.
    subject = render_string(body.subject, body.context) if body.context else body.subject
    html = render_string(body.body_html, body.context) if body.context else body.body_html
    text = (
        render_string(body.body_text, body.context)
        if (body.body_text and body.context)
        else (body.body_text or "")
    )

    # Persist a Notification row so transactional emails are auditable.
    n = await create_notification(
        db,
        user_id=body.user_id,
        tenant_id=body.tenant_id,
        event_type=body.event_type,
        title=subject,
        body=html,
        severity=body.severity,
        metadata={"template_id": body.template_id, "transactional": True},
        source="identity-service",
    )

    channels = get_channels()
    req = DeliveryRequest(
        notification_id=n.id,
        user_id=body.user_id,
        tenant_id=body.tenant_id,
        title=subject,
        body=html,
        recipient_email=str(body.recipient),
        metadata={"plain": text} if text else {},
    )
    result = await channels.email.send(req)
    return {
        "notification_id": n.id,
        "status": result.status,
        "error": result.error,
    }
