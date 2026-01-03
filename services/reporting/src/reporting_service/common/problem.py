"""RFC 7807 Problem Details.

Service-specific adapter that re-uses the shared error-code catalog from
:mod:`plaglens_common.problem`.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401

PROBLEM_BASE = "https://docs.plaglens.ru/errors/"


class Problem(HTTPException):
    """Domain HTTPException carrying RFC 7807 fields."""

    def __init__(
        self,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        type_suffix: str | None = None,
        errors: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.code = code
        self.title = title
        self.problem_type = f"{PROBLEM_BASE}{type_suffix or code.lower()}"
        self.detail_text = detail
        self.errors = errors or []
        super().__init__(status_code=status, detail=detail or title, headers=headers)

    def to_dict(self, instance: str, request_id: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {
            "type": self.problem_type,
            "title": self.title,
            "status": self.status_code,
            "code": self.code,
            "instance": instance,
        }
        if self.detail_text:
            body["detail"] = self.detail_text
        if self.errors:
            body["errors"] = self.errors
        if request_id:
            body["request_id"] = request_id
        return body


def problem_response(p: Problem, instance: str, request_id: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=p.status_code,
        content=p.to_dict(instance, request_id),
        media_type="application/problem+json",
        headers=p.headers or None,
    )


def not_found(detail: str = "Resource not found") -> Problem:
    return Problem(404, "NOT_FOUND", "Not Found", detail)


def forbidden(detail: str = "Forbidden") -> Problem:
    return Problem(403, "FORBIDDEN", "Forbidden", detail)


def unauthenticated(detail: str = "Missing or invalid token") -> Problem:
    return Problem(401, "UNAUTHENTICATED", "Unauthenticated", detail)


def validation_failed(detail: str, errors: list[dict[str, Any]] | None = None) -> Problem:
    return Problem(422, "VALIDATION_FAILED", "Validation Error", detail, errors=errors)


def conflict(code: str, detail: str) -> Problem:
    return Problem(409, code, "Conflict", detail)


def tenant_mismatch() -> Problem:
    return Problem(403, "TENANT_MISMATCH", "Tenant mismatch", "Resource belongs to another tenant")


def internal(detail: str = "Internal server error") -> Problem:
    return Problem(500, "INTERNAL", "Internal", detail)
