"""Cursor-based pagination helpers."""
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


def encode_cursor(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str | None) -> dict[str, Any] | None:
    if not cursor:
        return None
    pad = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode((cursor + pad).encode("ascii"))
        return json.loads(raw)
    except Exception:
        return None


class PageQuery(BaseModel):
    cursor: str | None = None
    limit: int = Field(default=50, ge=1, le=200)
    sort: str | None = None
