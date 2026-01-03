"""RFC 7807 ``application/problem+json`` helpers.

Service-specific adapter that re-uses the shared error-code catalog from
:mod:`plaglens_common.problem`.  Keeps the local ``ProblemException``
HTTPException subclass for backward-compatibility with router call-sites.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_BASE = "https://docs.plaglens.ru/errors/"
PROBLEM_MEDIA_TYPE = "application/problem+json"


class FieldError(BaseModel):
    field: str
    code: str
    message: str


class Problem(BaseModel):
    type: str = Field(default=f"{PROBLEM_BASE}internal")
    title: str = "Internal error"
    status: int = 500
    detail: str | None = None
    instance: str | None = None
    code: str = "INTERNAL"
    errors: list[FieldError] | None = None
    request_id: str | None = None


_DEFAULT_TITLES = {
    400: "Bad Request",
    401: "Unauthenticated",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    410: "Gone",
    413: "Payload Too Large",
    422: "Validation Failed",
    423: "Locked",
    429: "Rate Limited",
    451: "Legal Blocked",
    500: "Internal Server Error",
    502: "Upstream Failed",
    503: "Service Unavailable",
    504: "Upstream Timeout",
}

_DEFAULT_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    410: "GONE",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_FAILED",
    423: "LOCKED",
    429: "RATE_LIMITED",
    451: "LEGAL_BLOCKED",
    500: "INTERNAL",
    502: "UPSTREAM_FAILED",
    503: "SERVICE_UNAVAILABLE",
    504: "UPSTREAM_TIMEOUT",
}


def problem_response(
    *,
    status: int,
    detail: str | None = None,
    code: str | None = None,
    title: str | None = None,
    instance: str | None = None,
    errors: list[FieldError] | None = None,
    request_id: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> JSONResponse:
    code = code or _DEFAULT_CODES.get(status, "INTERNAL")
    payload = Problem(
        type=f"{PROBLEM_BASE}{code.lower()}",
        title=title or _DEFAULT_TITLES.get(status, "Error"),
        status=status,
        detail=detail,
        instance=instance,
        code=code,
        errors=errors,
        request_id=request_id,
    ).model_dump(exclude_none=True)
    headers = {"Content-Type": PROBLEM_MEDIA_TYPE}
    if extra_headers:
        headers.update(extra_headers)
    return JSONResponse(payload, status_code=status, headers=headers)


class ProblemException(HTTPException):
    """HTTPException carrying a structured RFC 7807 payload."""

    def __init__(
        self,
        status_code: int,
        detail: str | None = None,
        code: str | None = None,
        errors: list[FieldError] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code or _DEFAULT_CODES.get(status_code, "INTERNAL")
        self.errors = errors


async def problem_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    request_id = request.headers.get("X-Request-Id") or getattr(
        request.state, "request_id", None
    )
    code: str | None = getattr(exc, "code", None)
    errors: list[FieldError] | None = getattr(exc, "errors", None)
    return problem_response(
        status=exc.status_code,
        detail=exc.detail if isinstance(exc.detail, str) else None,
        code=code,
        instance=str(request.url.path),
        errors=errors,
        request_id=request_id,
        extra_headers=dict(exc.headers) if exc.headers else None,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors: list[FieldError] = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
        errors.append(
            FieldError(
                field=loc or "body",
                code=str(err.get("type", "invalid")),
                message=str(err.get("msg", "")),
            )
        )
    request_id = request.headers.get("X-Request-Id") or getattr(
        request.state, "request_id", None
    )
    return problem_response(
        status=422,
        detail="Request body validation failed",
        code="VALIDATION_FAILED",
        instance=str(request.url.path),
        errors=errors,
        request_id=request_id,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = request.headers.get("X-Request-Id") or getattr(
        request.state, "request_id", None
    )
    return problem_response(
        status=500,
        detail=str(exc) if request.app.debug else "Internal server error",
        instance=str(request.url.path),
        request_id=request_id,
    )


def jsonable(obj: Any) -> Any:
    return jsonable_encoder(obj)
