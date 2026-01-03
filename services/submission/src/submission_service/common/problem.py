"""RFC 7807 problem+json responses.

Service-specific adapter that re-uses the shared error-code catalog from
:mod:`plaglens_common.problem`.  Keeps the local factory helpers
(:func:`not_found`, :func:`forbidden`, ...) used by routers.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401
from pydantic import BaseModel


class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    code: str
    errors: list[dict[str, Any]] | None = None
    request_id: str | None = None


def problem_response(
    status: int,
    code: str,
    title: str,
    detail: str | None = None,
    *,
    errors: list[dict[str, Any]] | None = None,
    instance: str | None = None,
    request_id: str | None = None,
    type_: str = "about:blank",
) -> JSONResponse:
    body = ProblemDetail(
        type=type_,
        title=title,
        status=status,
        detail=detail,
        instance=instance,
        code=code,
        errors=errors,
        request_id=request_id,
    ).model_dump(exclude_none=True)
    return JSONResponse(
        status_code=status,
        content=body,
        media_type="application/problem+json",
    )


class ProblemException(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str | None = None,
        *,
        errors: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
        self.title = title
        self.errors = errors


def not_found(detail: str = "Resource not found") -> ProblemException:
    return ProblemException(404, "NOT_FOUND", "Not Found", detail)


def forbidden(detail: str = "Forbidden") -> ProblemException:
    return ProblemException(403, "FORBIDDEN", "Forbidden", detail)


def unauthenticated(detail: str = "Authentication required") -> ProblemException:
    return ProblemException(401, "UNAUTHENTICATED", "Unauthenticated", detail)


def conflict(detail: str = "Conflict", code: str = "CONFLICT") -> ProblemException:
    return ProblemException(409, code, "Conflict", detail)


def validation_error(detail: str, errors: list[dict[str, Any]] | None = None) -> ProblemException:
    return ProblemException(422, "VALIDATION_FAILED", "Validation Error", detail, errors=errors)


def payload_too_large(detail: str = "Payload too large") -> ProblemException:
    return ProblemException(413, "PAYLOAD_TOO_LARGE", "Payload Too Large", detail)
