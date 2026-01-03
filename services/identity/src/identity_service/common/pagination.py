"""Cursor pagination envelope (matches 01-CROSS-CUTTING.md §4)."""
from __future__ import annotations

import base64
import json
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Pagination(BaseModel):
    next_cursor: Optional[str] = None
    has_more: bool = False
    limit: int = 50


class Page(BaseModel, Generic[T]):
    data: list[T]
    pagination: Pagination = Field(default_factory=Pagination)


class CursorParams(BaseModel):
    cursor: Optional[str] = None
    limit: int = Field(50, ge=1, le=200)
    sort: Optional[str] = None


def encode_cursor(payload: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def decode_cursor(cursor: Optional[str]) -> Optional[dict[str, Any]]:
    if not cursor:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8"))
    except Exception:
        return None
