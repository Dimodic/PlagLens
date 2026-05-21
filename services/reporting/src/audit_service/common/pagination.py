"""Cursor pagination envelope (matches 01-CROSS-CUTTING.md §4)."""
from __future__ import annotations

import base64
import json
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Pagination(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int = 50


class Page(BaseModel, Generic[T]):
    data: list[T]
    pagination: Pagination = Field(default_factory=Pagination)


def encode_cursor(payload: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str | None) -> dict[str, Any] | None:
    if not cursor:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8"))
    except Exception:
        return None
