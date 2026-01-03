"""Cursor-based pagination per ``01-CROSS-CUTTING.md`` §4."""

from __future__ import annotations

import base64
import json
from collections.abc import Sequence
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Pagination(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int = 50


class Page(BaseModel, Generic[T]):  # Pydantic v2 needs the legacy ``Generic[T]`` form
    data: list[T] = Field(default_factory=list)
    pagination: Pagination = Field(default_factory=Pagination)


def encode_cursor(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def decode_cursor(cursor: str | None) -> dict[str, Any] | None:
    if not cursor:
        return None
    pad = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(cursor + pad)
        decoded = json.loads(raw.decode())
        return decoded if isinstance(decoded, dict) else None
    except (ValueError, json.JSONDecodeError):
        return None


def build_page(
    rows: Sequence[T],
    *,
    limit: int,
    next_id: int | str | None,
) -> Page[T]:
    has_more = next_id is not None
    cursor = encode_cursor({"id": next_id}) if has_more else None
    return Page[T](
        data=list(rows),
        pagination=Pagination(next_cursor=cursor, has_more=has_more, limit=limit),
    )
