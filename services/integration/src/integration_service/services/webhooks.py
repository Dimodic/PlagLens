"""Webhook receive pipeline: signature verify + idempotency + persist."""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any, Mapping, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.common.hmac_verify import verify_signature
from integration_service.common.ids import new_webhook_event_id
from integration_service.common.kafka_bus import KafkaBus
from integration_service.config import get_settings
from integration_service.models import WebhookEvent
from integration_service.repositories import WebhookEventRepo

logger = structlog.get_logger(__name__)

KIND_TO_SECRET_ATTR = {
    "stepik": "webhook_secret_stepik",
    "yandex_contest": "webhook_secret_yandex_contest",
    "plagiarism": "webhook_secret_plagiarism",
    "llm": "webhook_secret_llm",
}


def _shared_secret(kind: str) -> Optional[str]:
    s = get_settings()
    attr = KIND_TO_SECRET_ATTR.get(kind)
    if attr is None:
        return None
    return getattr(s, attr, None)


def _signature_from_headers(headers: Mapping[str, str]) -> Optional[str]:
    for name in ("X-Signature", "x-signature", "X-Hub-Signature-256", "x-hub-signature-256"):
        if name in headers:
            return headers[name]
    return None


def extract_event_id(kind: str, payload: dict[str, Any], headers: Mapping[str, str]) -> Optional[str]:
    if kind == "telegram":
        return str(payload.get("update_id")) if "update_id" in payload else None
    for header_key in ("X-Event-Id", "x-event-id", "X-Request-Id", "x-request-id"):
        if header_key in headers:
            return headers[header_key]
    for key in ("event_id", "id", "delivery_id"):
        if key in payload:
            return str(payload[key])
    return None


def hash_payload(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


async def receive_webhook(
    session: AsyncSession,
    kind: str,
    payload: bytes,
    headers: Mapping[str, str],
    *,
    tenant_id: Optional[str] = None,
    integration_id: Optional[str] = None,
    bus: Optional[KafkaBus] = None,
) -> tuple[WebhookEvent, bool]:
    """Persist webhook + return ``(event, is_duplicate)``.

    The function returns 200 to the caller in any case; further processing is
    asynchronous and reads from the ``webhook_events`` table.
    """
    repo = WebhookEventRepo(session)
    body_hash = hash_payload(payload)
    try:
        body_obj: dict[str, Any] = json.loads(payload.decode("utf-8") or "{}")
        if not isinstance(body_obj, dict):
            body_obj = {"_raw": body_obj}
    except Exception:
        body_obj = {}

    external_event_id = extract_event_id(kind, body_obj, headers)
    if external_event_id:
        existing = await repo.get_by_external(kind, external_event_id)
        if existing is not None:
            return existing, True

    secret = _shared_secret(kind)
    sig_valid = True
    if secret:
        signature = _signature_from_headers(headers) or ""
        sig_valid = verify_signature(secret, payload, signature)

    s3_uri = f"s3://plaglens-webhooks/{kind}/{body_hash}.json"
    raw_text: Optional[str] = None
    try:
        raw_text = payload.decode("utf-8")
    except Exception:
        raw_text = None

    evt = WebhookEvent(
        id=new_webhook_event_id(),
        integration_id=integration_id,
        tenant_id=tenant_id,
        kind=kind,
        external_event_id=external_event_id,
        payload_hash=body_hash,
        signature_valid=sig_valid,
        raw_payload=raw_text,
        raw_payload_uri=s3_uri,
        status="received" if sig_valid else "ignored",
    )
    await repo.add(evt)

    if bus is not None:
        await bus.publish(
            get_settings().kafka_topic_integration_import,
            "integration.webhook.received.v1",
            {
                "kind": kind,
                "event_id": evt.id,
                "external_event_id": external_event_id,
                "signature_valid": sig_valid,
            },
            tenant_id=tenant_id or "tnt_unknown",
            subject=f"webhook:{evt.id}",
        )
    return evt, False


async def mark_processed(
    session: AsyncSession,
    evt: WebhookEvent,
    *,
    status: str = "processed",
    error: Optional[str] = None,
) -> WebhookEvent:
    evt.status = status
    evt.processed_at = datetime.now(UTC)
    evt.error = error
    await session.flush()
    return evt
