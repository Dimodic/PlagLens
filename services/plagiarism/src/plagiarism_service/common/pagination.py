"""Cursor pagination helpers (cross-cutting §4)."""
from __future__ import annotations

import base64
import json
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PageInfo(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int = 50


class Page(BaseModel, Generic[T]):
    data: list[T]
    pagination: PageInfo


class PageQuery(BaseModel):
    cursor: str | None = None
    limit: int = Field(default=50, ge=1, le=200)
    sort: str | None = None


def encode_cursor(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), default=str).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> dict[str, Any] | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded.encode())
        return json.loads(raw)
    except Exception:
        return None
