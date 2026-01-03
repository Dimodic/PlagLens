"""RFC 7807 problem objects + helpers.

Service-specific adapter that re-uses the shared error-code catalog from
:mod:`plaglens_common.problem`.
"""
from __future__ import annotations

from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401
from pydantic import ValidationError
from starlette.exceptions import HTTPException

PROBLEM_DOCS_BASE = "https://docs.plaglens.ru/errors"


class Problem(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str | None = None,
        type_slug: str | None = None,
        errors: list[dict[str, Any]] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.title = title
        self.detail = detail
        self.type_slug = type_slug or code.lower()
        self.errors = errors or []
        super().__init__(detail or title)


def problem_payload(
    *,
    status_code: int,
    code: str,
    title: str,
    detail: str | None,
    type_slug: str,
    instance: str,
    request_id: str | None,
    errors: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "type": f"{PROBLEM_DOCS_BASE}/{type_slug}",
        "title": title,
        "status": status_code,
        "detail": detail,
        "instance": instance,
        "code": code,
        "errors": errors or [],
        "request_id": request_id,
    }


def _request_id(request: Request) -> str | None:
    rid = request.headers.get("X-Request-Id") or getattr(request.state, "request_id", None)
    return rid


async def problem_handler(request: Request, exc: Problem) -> JSONResponse:
    payload = problem_payload(
        status_code=exc.status_code,
        code=exc.code,
        title=exc.title,
        detail=exc.detail,
        type_slug=exc.type_slug,
        instance=str(request.url.path),
        request_id=_request_id(request),
        errors=exc.errors,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=payload,
        media_type="application/problem+json",
        headers={"X-Request-Id": _request_id(request) or ""},
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    code_map = {
        400: ("BAD_REQUEST", "Bad Request"),
        401: ("UNAUTHENTICATED", "Unauthenticated"),
        403: ("FORBIDDEN", "Forbidden"),
        404: ("NOT_FOUND", "Not Found"),
        409: ("CONFLICT", "Conflict"),
        413: ("PAYLOAD_TOO_LARGE", "Payload Too Large"),
        422: ("VALIDATION_FAILED", "Validation Failed"),
        429: ("RATE_LIMITED", "Rate Limited"),
        500: ("INTERNAL", "Internal Server Error"),
        502: ("UPSTREAM_FAILED", "Upstream Failed"),
        503: ("SERVICE_UNAVAILABLE", "Service Unavailable"),
        504: ("UPSTREAM_TIMEOUT", "Upstream Timeout"),
    }
    code, title = code_map.get(exc.status_code, ("INTERNAL", "Error"))
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    payload = problem_payload(
        status_code=exc.status_code,
        code=code,
        title=title,
        detail=detail,
        type_slug=code.lower(),
        instance=str(request.url.path),
        request_id=_request_id(request),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=payload,
        media_type="application/problem+json",
        headers={"X-Request-Id": _request_id(request) or ""},
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errs = []
    for e in exc.errors():
        errs.append(
            {
                "field": ".".join(str(x) for x in e.get("loc", [])),
                "code": e.get("type", "invalid"),
                "message": e.get("msg", ""),
            }
        )
    payload = problem_payload(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code="VALIDATION_FAILED",
        title="Validation Error",
        detail="Request validation failed",
        type_slug="validation",
        instance=str(request.url.path),
        request_id=_request_id(request),
        errors=errs,
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=payload,
        media_type="application/problem+json",
        headers={"X-Request-Id": _request_id(request) or ""},
    )


async def pydantic_validation_handler(
    request: Request, exc: ValidationError
) -> JSONResponse:
    errs = [
        {
            "field": ".".join(str(x) for x in e.get("loc", [])),
            "code": e.get("type", "invalid"),
            "message": e.get("msg", ""),
        }
        for e in exc.errors()
    ]
    payload = problem_payload(
        status_code=422,
        code="VALIDATION_FAILED",
        title="Validation Error",
        detail="Validation failed",
        type_slug="validation",
        instance=str(request.url.path),
        request_id=_request_id(request),
        errors=errs,
    )
    return JSONResponse(
        status_code=422,
        content=payload,
        media_type="application/problem+json",
        headers={"X-Request-Id": _request_id(request) or ""},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    payload = problem_payload(
        status_code=500,
        code="INTERNAL",
        title="Internal Server Error",
        detail=str(exc) if str(exc) else None,
        type_slug="internal",
        instance=str(request.url.path),
        request_id=_request_id(request),
    )
    return JSONResponse(
        status_code=500,
        content=payload,
        media_type="application/problem+json",
        headers={"X-Request-Id": _request_id(request) or ""},
    )
