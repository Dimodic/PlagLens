"""Outgoing webhook dispatcher (HMAC-signed POST to subscribers)."""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import httpx

from ..common.events import CloudEvent
from ..common.logging import get_logger

log = get_logger(__name__)


def sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def dispatch_event(
    event: CloudEvent,
    *,
    subscriptions: list[Any],
    timeout_seconds: float = 10.0,
) -> int:
    """Returns count of successful deliveries."""
    body_payload = event.model_dump(mode="json")
    body = json.dumps(body_payload, separators=(",", ":")).encode()
    delivered = 0
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        for sub in subscriptions:
            if not sub.enabled or sub.deleted_at is not None:
                continue
            sig = sign(body, sub.secret)
            try:
                resp = await client.post(
                    sub.url,
                    content=body,
                    headers={
                        "Content-Type": "application/cloudevents+json",
                        "X-PlagLens-Signature": f"sha256={sig}",
                        "X-PlagLens-Event-Type": event.type,
                        "X-PlagLens-Event-Id": event.id,
                    },
                )
                if resp.is_success:
                    delivered += 1
                else:
                    log.warning(
                        "webhook_failed",
                        url=sub.url,
                        status=resp.status_code,
                        event_type=event.type,
                    )
            except httpx.HTTPError as exc:
                log.warning("webhook_error", url=sub.url, error=str(exc))
    return delivered
