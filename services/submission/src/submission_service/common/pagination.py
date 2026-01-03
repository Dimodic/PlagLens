"""Cursor / offset pagination helpers.

Two pagination modes coexist:

- **Cursor** (legacy): opaque cursor, "next" only. Cheap, no COUNT(*).
- **Offset** (page-style): ``offset`` + ``limit`` + a `total` count. Lets the
  UI render numbered page buttons (1 2 3 4 …) like Yandex.Contest does.

Both modes share the same ``Page`` envelope; the response carries `total`
and `offset` so the client can pick whichever it cares about. Endpoints that
support offset mode populate both, endpoints that don't leave `total` as
``None``.
"""
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
    # Offset-pagination fields. Optional so existing cursor-only endpoints
    # don't have to populate them.
    offset: int = 0
    total: int | None = None


class Page(BaseModel, Generic[T]):
    data: list[T]
    pagination: PageInfo


class PageQuery(BaseModel):
    cursor: str | None = None
    offset: int = Field(default=0, ge=0)
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
