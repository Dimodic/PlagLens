"""CloudEvents 1.0 envelope helpers."""
from __future__ import annotations

import secrets
from typing import Any

from plaglens_common.events import CloudEvent


def _evt_id() -> str:
    return f"evt_{secrets.token_hex(12)}"


def build_envelope(
    type: str,
    *,
    tenant_id: str,
    subject: str,
    data: dict[str, Any],
    actor: dict[str, Any] | None = None,
    trace_id: str | None = None,
    source: str = "/services/reporting",
) -> dict[str, Any]:
    """Build a CloudEvents envelope (as a dict) from the shared CloudEvent model."""
    return CloudEvent(
        type=type,
        source=source,
        subject=subject,
        tenant_id=tenant_id,
        actor=actor or {"type": "system", "id": "reporting-service"},
        data=data,
        trace_id=trace_id,
    ).model_dump(mode="json")


def parse_envelope(raw: dict[str, Any]) -> dict[str, Any]:
    """Return the envelope-as-dict (validated for the fields we use)."""
    if "type" not in raw:
        raise ValueError("CloudEvent missing 'type'")
    raw.setdefault("id", _evt_id())
    raw.setdefault("data", {})
    return raw
