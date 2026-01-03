from __future__ import annotations

from plaglens_common.headers import (
    CONTENT_TYPE_PROBLEM,
    IDEMPOTENCY_KEY,
    REQUEST_ID,
    TENANT_HINT,
    request_id_or_default,
)


def test_canonical_header_names() -> None:
    assert REQUEST_ID == "X-Request-Id"
    assert IDEMPOTENCY_KEY == "Idempotency-Key"
    assert TENANT_HINT == "X-Tenant-Hint"
    assert CONTENT_TYPE_PROBLEM == "application/problem+json"


def test_request_id_or_default_with_dict_like() -> None:
    assert request_id_or_default({}, default="d") == "d"
    assert request_id_or_default({REQUEST_ID: "rid-1"}) == "rid-1"


def test_request_id_or_default_with_object_without_get() -> None:
    assert request_id_or_default(object(), default="fallback") == "fallback"
