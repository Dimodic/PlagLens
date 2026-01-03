from __future__ import annotations

import pytest

from plaglens_common.errors import ValidationError
from plaglens_common.pagination import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    CursorPagination,
    PaginatedResponse,
    decode_cursor,
    encode_cursor,
    parse_pagination_query,
)


def test_encode_decode_roundtrip_str_and_int() -> None:
    cursor = encode_cursor("2026-05-01T00:00:00Z", 42)
    sv, item_id = decode_cursor(cursor)
    assert sv == "2026-05-01T00:00:00Z"
    assert item_id == 42


def test_encode_decode_roundtrip_with_none() -> None:
    cursor = encode_cursor(None, "id_xyz")
    sv, item_id = decode_cursor(cursor)
    assert sv is None
    assert item_id == "id_xyz"


def test_decode_invalid_raises_validation() -> None:
    with pytest.raises(ValidationError):
        decode_cursor("!!!!nope!!!!")
    with pytest.raises(ValidationError):
        decode_cursor("")


def test_parse_pagination_query_clamps_and_validates() -> None:
    p = parse_pagination_query(cursor=None, limit=DEFAULT_LIMIT)
    assert p.limit == DEFAULT_LIMIT
    with pytest.raises(ValidationError):
        parse_pagination_query(limit=MAX_LIMIT + 1)
    with pytest.raises(ValidationError):
        parse_pagination_query(limit=0)


def test_paginated_response_envelope_structure() -> None:
    resp = PaginatedResponse[dict](data=[{"id": 1}], pagination=CursorPagination(limit=10, has_more=False))
    dumped = resp.model_dump()
    assert dumped["data"] == [{"id": 1}]
    assert dumped["pagination"]["next_cursor"] is None
    assert dumped["pagination"]["has_more"] is False
