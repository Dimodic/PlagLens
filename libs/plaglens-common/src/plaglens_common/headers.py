"""Standard HTTP header names used across PlagLens services.

Centralised so that header strings are not duplicated/typoed across the codebase.
See `docs/architecture/legacy/01-CROSS-CUTTING.md` §3.
"""

from __future__ import annotations

from typing import Final

# Request headers
AUTHORIZATION: Final[str] = "Authorization"
IDEMPOTENCY_KEY: Final[str] = "Idempotency-Key"
TENANT_HINT: Final[str] = "X-Tenant-Hint"
REQUEST_ID: Final[str] = "X-Request-Id"
ACCEPT_LANGUAGE: Final[str] = "Accept-Language"
IF_NONE_MATCH: Final[str] = "If-None-Match"
CROSS_TENANT: Final[str] = "X-Cross-Tenant"

# Response headers
RATE_LIMIT_LIMIT: Final[str] = "X-RateLimit-Limit"
RATE_LIMIT_REMAINING: Final[str] = "X-RateLimit-Remaining"
RATE_LIMIT_RESET: Final[str] = "X-RateLimit-Reset"
LOCATION: Final[str] = "Location"
ETAG: Final[str] = "ETag"
RETRY_AFTER: Final[str] = "Retry-After"
CONTENT_TYPE: Final[str] = "Content-Type"

# Content types
CONTENT_TYPE_JSON: Final[str] = "application/json"
CONTENT_TYPE_PROBLEM: Final[str] = "application/problem+json"


def request_id_or_default(headers: object, default: str | None = None) -> str | None:
    """Best-effort retrieval of X-Request-Id from a Starlette/HTTPX-like Headers mapping.

    Returns `default` when not present. Accepts any object with a `.get(name)` method.
    """
    getter = getattr(headers, "get", None)
    if getter is None:
        return default
    value = getter(REQUEST_ID)  # type: ignore[misc]
    if value is None:
        return default
    return str(value)


__all__ = [
    "ACCEPT_LANGUAGE",
    "AUTHORIZATION",
    "CONTENT_TYPE",
    "CONTENT_TYPE_JSON",
    "CONTENT_TYPE_PROBLEM",
    "CROSS_TENANT",
    "ETAG",
    "IDEMPOTENCY_KEY",
    "IF_NONE_MATCH",
    "LOCATION",
    "RATE_LIMIT_LIMIT",
    "RATE_LIMIT_REMAINING",
    "RATE_LIMIT_RESET",
    "REQUEST_ID",
    "RETRY_AFTER",
    "TENANT_HINT",
    "request_id_or_default",
]
