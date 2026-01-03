"""Channel ABC + DTOs."""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class DeliveryRequest:
    notification_id: str
    user_id: str
    tenant_id: str
    title: str
    body: str
    action_url: str | None = None
    severity: str = "info"
    metadata: dict[str, Any] = field(default_factory=dict)
    recipient_email: str | None = None
    recipient_telegram_chat_id: str | None = None


@dataclass(slots=True)
class DeliveryResult:
    status: str  # sent / delivered / failed / skipped
    error: str | None = None
    retry_after: float | None = None


class Channel(abc.ABC):
    name: str = ""

    @abc.abstractmethod
    async def send(self, req: DeliveryRequest) -> DeliveryResult:
        ...

    async def close(self) -> None:
        return None
