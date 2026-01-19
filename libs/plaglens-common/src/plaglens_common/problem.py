"""RFC 7807 Problem Details for HTTP APIs — the canonical error envelope.

Services raise ``ProblemException(status=..., code=..., title=...)`` from
anywhere and register the handlers returned by :func:`make_handlers` on their
FastAPI app. The wire content-type is ``application/problem+json``.

See ``docs/architecture/01-CROSS-CUTTING.md`` §5.
"""

from __future__ import annotations

import logging
from typing import Any, Final

from pydantic import BaseModel, ConfigDict, Field

CONTENT_TYPE_PROBLEM: Final[str] = "application/problem+json"

# fmt: off
ERROR_CODES: Final[dict[str, str]] = {
    "BAD_REQUEST":              "BAD_REQUEST",
    "UNAUTHENTICATED":          "UNAUTHENTICATED",
    "TOKEN_EXPIRED":            "TOKEN_EXPIRED",
    "TOKEN_REVOKED":            "TOKEN_REVOKED",
    "FORBIDDEN":                "FORBIDDEN",
    "TENANT_MISMATCH":          "TENANT_MISMATCH",
    "NOT_FOUND":                "NOT_FOUND",
    "CONFLICT":                 "CONFLICT",
    "IDEMPOTENCY_KEY_CONFLICT": "IDEMPOTENCY_KEY_CONFLICT",
    "GONE":                     "GONE",
    "PAYLOAD_TOO_LARGE":        "PAYLOAD_TOO_LARGE",
    "VALIDATION_FAILED":        "VALIDATION_FAILED",
    "LOCKED":                   "LOCKED",
    "RATE_LIMITED":             "RATE_LIMITED",
    "LEGAL_BLOCKED":            "LEGAL_BLOCKED",
    "INTERNAL":                 "INTERNAL",
    "UPSTREAM_FAILED":          "UPSTREAM_FAILED",
    "SERVICE_UNAVAILABLE":      "SERVICE_UNAVAILABLE",
    "UPSTREAM_TIMEOUT":         "UPSTREAM_TIMEOUT",
    "BUDGET_EXCEEDED":          "BUDGET_EXCEEDED",
}
# fmt: on

# Default mapping HTTP status -> code (used when caller doesn't specify code).
_DEFAULT_CODE_BY_STATUS: Final[dict[int, str]] = {
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

DEFAULT_TYPE_BASE: Final[str] = "https://docs.plaglens.ru/errors/"

logger = logging.getLogger(__name__)


def _type_for(code: str, type_: str | None = None) -> str:
    return type_ or (DEFAULT_TYPE_BASE + code.lower())


class ProblemFieldError(BaseModel):
    """One per-field validation error inside ``Problem.errors``."""

    model_config = ConfigDict(extra="allow")

    field: str
    code: str
    message: str


class Problem(BaseModel):
    """RFC 7807 Problem Details. Wire content-type: ``application/problem+json``."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    type: str = Field(default=DEFAULT_TYPE_BASE + "internal")
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    code: str
    errors: list[ProblemFieldError] | None = None
    request_id: str | None = None

    @classmethod
    def from_status(
        cls,
        status: int,
        *,
        title: str | None = None,
        detail: str | None = None,
        code: str | None = None,
        instance: str | None = None,
        errors: list[ProblemFieldError] | None = None,
        request_id: str | None = None,
        type_uri: str | None = None,
    ) -> Problem:
        resolved_code = code or _DEFAULT_CODE_BY_STATUS.get(status, "INTERNAL")
        resolved_title = title or resolved_code.replace("_", " ").title()
        return cls(
            type=_type_for(resolved_code, type_uri),
            title=resolved_title,
            status=status,
            detail=detail,
            instance=instance,
            code=resolved_code,
            errors=errors,
            request_id=request_id,
        )


class ProblemException(Exception):
    """Raise from anywhere; the handlers from :func:`make_handlers` render it."""

    def __init__(
        self,
        *,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        type_: str | None = None,
        errors: list[ProblemFieldError] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.type_ = _type_for(code, type_)
        self.errors = errors
        self.headers = headers or {}
        super().__init__(detail or title)


def problem_response(
    request: Any,
    *,
    status: int,
    code: str,
    title: str,
    detail: str | None = None,
    type_: str | None = None,
    errors: list[ProblemFieldError] | None = None,
    headers: dict[str, str] | None = None,
) -> Any:
    """Build a JSONResponse carrying an RFC 7807 ``Problem`` body."""
    from fastapi.encoders import jsonable_encoder
    from fastapi.responses import JSONResponse

    body = Problem(
        type=_type_for(code, type_),
        title=title,
        status=status,
        detail=detail,
        instance=str(request.url.path),
        code=code,
        errors=errors,
        request_id=getattr(getattr(request, "state", None), "request_id", None),
    )
    response_headers: dict[str, str] = {"Content-Type": CONTENT_TYPE_PROBLEM}
    if headers:
        response_headers.update(headers)
    return JSONResponse(
        status_code=status,
        content=jsonable_encoder(body, exclude_none=True),
        headers=response_headers,
    )


def make_handlers() -> dict[type[Exception], Any]:
    """Exception handlers to register via ``app.add_exception_handler``."""
    from fastapi.exceptions import RequestValidationError
    from starlette.exceptions import HTTPException as StarletteHTTPException

    async def _problem(request: Any, exc: ProblemException) -> Any:
        return problem_response(
            request,
            status=exc.status,
            code=exc.code,
            title=exc.title,
            detail=exc.detail,
            type_=exc.type_,
            errors=exc.errors,
            headers=exc.headers,
        )

    async def _http(request: Any, exc: StarletteHTTPException) -> Any:
        title = exc.detail if isinstance(exc.detail, str) else "HTTP error"
        return problem_response(
            request,
            status=exc.status_code,
            code=_DEFAULT_CODE_BY_STATUS.get(exc.status_code, "BAD_REQUEST"),
            title=title,
            detail=title,
        )

    async def _validation(request: Any, exc: RequestValidationError) -> Any:
        errors = [
            ProblemFieldError(
                field=".".join(str(p) for p in err.get("loc", [])),
                code=err.get("type", "invalid"),
                message=err.get("msg", "Invalid value"),
            )
            for err in exc.errors()
        ]
        return problem_response(
            request,
            status=422,
            code="VALIDATION_FAILED",
            title="Validation Error",
            detail="Request body validation failed",
            errors=errors,
        )

    async def _unhandled(request: Any, exc: Exception) -> Any:
        return problem_response(
            request,
            status=500,
            code="INTERNAL",
            title="Internal Server Error",
            detail=str(exc),
        )

    return {
        ProblemException: _problem,
        StarletteHTTPException: _http,
        RequestValidationError: _validation,
        Exception: _unhandled,
    }


__all__ = [
    "CONTENT_TYPE_PROBLEM",
    "DEFAULT_TYPE_BASE",
    "ERROR_CODES",
    "Problem",
    "ProblemException",
    "ProblemFieldError",
    "make_handlers",
    "problem_response",
]
