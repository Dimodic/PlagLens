"""Centralized RFC 7807 problem-detail helpers + exception handlers.

Service-specific adapter that re-uses the shared error-code catalog from
:mod:`plaglens_common.problem`.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401
from starlette.exceptions import HTTPException as StarletteHTTPException

_BASE_TYPE = "https://docs.plaglens.ru/errors"


def problem(
    *,
    status: int,
    code: str,
    title: str,
    detail: str | None = None,
    instance: str | None = None,
    request_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": f"{_BASE_TYPE}/{code.lower()}",
        "title": title,
        "status": status,
        "code": code,
    }
    if detail is not None:
        body["detail"] = detail
    if instance is not None:
        body["instance"] = instance
    if request_id is not None:
        body["request_id"] = request_id
    if extra:
        body.update(extra)
    return body


def problem_response(
    *,
    status: int,
    code: str,
    title: str,
    detail: str | None = None,
    request: Request | None = None,
    extra: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    rid = None
    instance = None
    if request is not None:
        rid = getattr(request.state, "request_id", None)
        instance = request.url.path
    body = problem(
        status=status,
        code=code,
        title=title,
        detail=detail,
        instance=instance,
        request_id=rid,
        extra=extra,
    )
    h = {"Content-Type": "application/problem+json"}
    if rid:
        h["X-Request-Id"] = rid
    if headers:
        h.update(headers)
    return JSONResponse(content=body, status_code=status, headers=h)


# ---- FastAPI exception handlers ----


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "INTERNAL"
    title = "Error"
    if exc.status_code == 401:
        code, title = "UNAUTHENTICATED", "Unauthenticated"
    elif exc.status_code == 403:
        code, title = "FORBIDDEN", "Forbidden"
    elif exc.status_code == 404:
        code, title = "NOT_FOUND", "Not Found"
    elif exc.status_code == 409:
        code, title = "CONFLICT", "Conflict"
    elif exc.status_code == 413:
        code, title = "PAYLOAD_TOO_LARGE", "Payload Too Large"
    elif exc.status_code == 422:
        code, title = "VALIDATION_FAILED", "Validation Error"
    elif exc.status_code == 429:
        code, title = "RATE_LIMITED", "Rate Limited"
    elif exc.status_code == 502:
        code, title = "UPSTREAM_FAILED", "Bad Gateway"
    elif exc.status_code == 503:
        code, title = "SERVICE_UNAVAILABLE", "Service Unavailable"
    elif exc.status_code == 504:
        code, title = "UPSTREAM_TIMEOUT", "Gateway Timeout"
    detail = str(exc.detail) if exc.detail is not None else None
    extra_headers = exc.headers or {}
    return problem_response(
        status=exc.status_code,
        code=code,
        title=title,
        detail=detail,
        request=request,
        headers=dict(extra_headers),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return problem_response(
        status=500,
        code="INTERNAL",
        title="Internal Server Error",
        detail=type(exc).__name__,
        request=request,
    )


__all__ = [
    "problem",
    "problem_response",
    "http_exception_handler",
    "unhandled_exception_handler",
]
