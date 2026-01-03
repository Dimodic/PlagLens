"""Cursor pagination helpers."""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PageInfo(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int


@dataclass
class Page(Generic[T]):
    """Internal pagination container (NOT a Pydantic model — holds ORM rows).

    Routes serialise ``Page.data`` to dicts before responding."""

    pagination: PageInfo
    data: list[T] = field(default_factory=list)


def encode_cursor(payload: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()


def decode_cursor(cursor: str | None) -> dict[str, Any] | None:
    if not cursor:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception:
        return None
