"""Cursor-based pagination primitives.

See `docs/architecture/01-CROSS-CUTTING.md` §4.

Cursor format
-------------
Opaque to clients. Internally we encode `(sort_value, id)` as JSON then
URL-safe Base64. Decode is the inverse. `sort_value` may be any JSON-able value
(string, int, float, ISO timestamp string, null).
"""

from __future__ import annotations

import base64
import json
from collections.abc import Sequence
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from .errors import ValidationError

T = TypeVar("T")

DEFAULT_LIMIT: int = 50
MIN_LIMIT: int = 1
MAX_LIMIT: int = 200


class CursorPagination(BaseModel):
    """Pagination block returned in list endpoints."""

    model_config = ConfigDict(extra="forbid")

    next_cursor: str | None = None
    has_more: bool = False
    limit: int = Field(default=DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT)


class PaginatedResponse(BaseModel, Generic[T]):
    """Envelope used for list responses. `T` is the item model."""

    model_config = ConfigDict(extra="forbid")

    data: list[T] = Field(default_factory=list)
    pagination: CursorPagination


def encode_cursor(sort_value: Any, item_id: Any) -> str:
    """Encode `(sort_value, id)` to opaque url-safe base64 cursor.

    Both values must be JSON-serializable. `None`/`""`/`0` are valid and will round-trip.
    """
    payload = json.dumps([sort_value, item_id], separators=(",", ":"), default=str).encode(
        "utf-8"
    )
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def decode_cursor(cursor: str) -> tuple[Any, Any]:
    """Decode cursor produced by `encode_cursor`. Raises `ValidationError` on garbage."""
    if not cursor:
        raise ValidationError("Empty cursor")
    try:
        # Re-pad before decoding because we strip padding in encode_cursor.
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
        decoded = json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValidationError("Invalid cursor encoding") from exc

    if not isinstance(decoded, Sequence) or isinstance(decoded, str | bytes) or len(decoded) != 2:
        raise ValidationError("Cursor payload must be a 2-element array")
    return decoded[0], decoded[1]


def parse_pagination_query(
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> CursorPagination:
    """FastAPI dependency factory: parse + clamp pagination query params.

    Use it via `Depends(parse_pagination_query)` after declaring `cursor` and
    `limit` as Query params on your endpoint.
    """
    if limit < MIN_LIMIT or limit > MAX_LIMIT:
        raise ValidationError(f"limit must be between {MIN_LIMIT} and {MAX_LIMIT}")
    return CursorPagination(next_cursor=cursor, has_more=False, limit=limit)


# Convenience type aliases for FastAPI typing
LimitQuery = Annotated[int, Field(ge=MIN_LIMIT, le=MAX_LIMIT, default=DEFAULT_LIMIT)]
CursorQuery = Annotated[str | None, Field(default=None)]


__all__ = [
    "CursorPagination",
    "CursorQuery",
    "DEFAULT_LIMIT",
    "LimitQuery",
    "MAX_LIMIT",
    "MIN_LIMIT",
    "PaginatedResponse",
    "decode_cursor",
    "encode_cursor",
    "parse_pagination_query",
]
