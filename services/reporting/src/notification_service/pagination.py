"""Cursor pagination helpers (opaque base64 of (sort_value, id))."""
from __future__ import annotations

import base64
import json
from typing import Any


def encode_cursor(sort_value: Any, id_: str) -> str:
    raw = json.dumps({"s": str(sort_value), "id": id_}).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def decode_cursor(cursor: str | None) -> dict[str, Any] | None:
    if not cursor:
        return None
    try:
        pad = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(cursor + pad)
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None
