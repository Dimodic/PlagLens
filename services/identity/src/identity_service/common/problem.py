"""RFC 7807 ``application/problem+json`` envelope and helpers.

Service-specific adapter that bridges to :mod:`plaglens_common.problem`. The
``Problem`` Pydantic model and ``ProblemException`` constructor signature are
kept compatible with the existing identity-service call-sites, while
:class:`plaglens_common.Problem` / ``ERROR_CODES`` are imported for
shared error-code semantics.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401
from pydantic import BaseModel, Field

PROBLEM_CONTENT_TYPE = "application/problem+json"
ERROR_BASE = "https://docs.plaglens.ru/errors"


class ProblemFieldError(BaseModel):
    field: str
    code: str
    message: str


class Problem(BaseModel):
    type: str = Field(..., description="URI identifying the problem type")
    title: str
    status: int
    detail: Optional[str] = None
    instance: Optional[str] = None
    code: str
    errors: Optional[list[ProblemFieldError]] = None
    request_id: Optional[str] = None


class ProblemException(Exception):
    """Raise from anywhere; the exception handler renders RFC 7807 response."""

    def __init__(
        self,
        *,
        status: int,
        code: str,
        title: str,
        detail: Optional[str] = None,
        type_: Optional[str] = None,
        errors: Optional[list[ProblemFieldError]] = None,
        headers: Optional[dict[str, str]] = None,
    ) -> None:
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.type_ = type_ or f"{ERROR_BASE}/{code.lower()}"
        self.errors = errors
        self.headers = headers or {}
        super().__init__(detail or title)


def problem_response(
    request: Request,
    *,
    status: int,
    code: str,
    title: str,
    detail: Optional[str] = None,
    type_: Optional[str] = None,
    errors: Optional[list[ProblemFieldError]] = None,
    headers: Optional[dict[str, str]] = None,
) -> JSONResponse:
    body = Problem(
        type=type_ or f"{ERROR_BASE}/{code.lower()}",
        title=title,
        status=status,
        detail=detail,
        instance=str(request.url.path),
        code=code,
        errors=errors,
        request_id=getattr(request.state, "request_id", None),
    )
    response_headers: dict[str, str] = {"Content-Type": PROBLEM_CONTENT_TYPE}
    if headers:
        response_headers.update(headers)
    return JSONResponse(
        status_code=status,
        content=jsonable_encoder(body, exclude_none=True),
        headers=response_headers,
    )


def make_handlers() -> dict[type[Exception], Any]:
    """Wired up in main.py via ``app.add_exception_handler``."""
    from fastapi.exceptions import RequestValidationError
    from starlette.exceptions import HTTPException as StarletteHTTPException

    async def problem_exception_handler(request: Request, exc: ProblemException):
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

    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        code_map = {
            400: "BAD_REQUEST",
            401: "UNAUTHENTICATED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            405: "BAD_REQUEST",
            409: "CONFLICT",
            413: "PAYLOAD_TOO_LARGE",
            422: "VALIDATION_FAILED",
            423: "LOCKED",
            429: "RATE_LIMITED",
            500: "INTERNAL",
            502: "UPSTREAM_FAILED",
            503: "SERVICE_UNAVAILABLE",
            504: "UPSTREAM_TIMEOUT",
        }
        title = exc.detail if isinstance(exc.detail, str) else "HTTP error"
        return problem_response(
            request,
            status=exc.status_code,
            code=code_map.get(exc.status_code, "BAD_REQUEST"),
            title=title,
            detail=title,
        )

    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
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

    async def unhandled_exception_handler(request: Request, exc: Exception):
        return problem_response(
            request,
            status=500,
            code="INTERNAL",
            title="Internal Server Error",
            detail=str(exc),
        )

    return {
        ProblemException: problem_exception_handler,
        StarletteHTTPException: http_exception_handler,
        RequestValidationError: validation_exception_handler,
        Exception: unhandled_exception_handler,
    }
