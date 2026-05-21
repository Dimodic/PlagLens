"""In-app channel: notification row already exists; we publish to SSE pubsub."""
from __future__ import annotations

import json

from notification_service.channels.base import Channel, DeliveryRequest, DeliveryResult
from notification_service.redis_bus import publish_sse


class InAppChannel(Channel):
    name = "inapp"

    async def send(self, req: DeliveryRequest) -> DeliveryResult:
        payload = {
            "id": req.notification_id,
            "user_id": req.user_id,
            "tenant_id": req.tenant_id,
            "title": req.title,
            "body": req.body,
            "action_url": req.action_url,
            "severity": req.severity,
            "metadata": req.metadata,
        }
        try:
            await publish_sse(req.user_id, json.dumps(payload, ensure_ascii=False))
            return DeliveryResult(status="delivered")
        except Exception as e:
            return DeliveryResult(status="failed", error=str(e))
