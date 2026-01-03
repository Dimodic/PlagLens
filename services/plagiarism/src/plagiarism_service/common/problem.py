"""RFC-7807 ``application/problem+json`` helpers (cross-cutting §5).

Service-specific adapter that re-uses the shared error-code catalog from
:mod:`plaglens_common.problem`.
"""
from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401

ERROR_BASE = "https://docs.plaglens.ru/errors"


class ProblemError(Exception):
    def __init__(
        self,
        *,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        errors: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail or title)
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.errors = errors or []
        self.headers = headers or {}


def problem_response(request: Request, exc: ProblemError) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"{ERROR_BASE}/{exc.code.lower()}",
        "title": exc.title,
        "status": exc.status,
        "code": exc.code,
        "instance": request.url.path,
        "request_id": request.headers.get("x-request-id", ""),
    }
    if exc.detail:
        body["detail"] = exc.detail
    if exc.errors:
        body["errors"] = exc.errors
    return JSONResponse(
        status_code=exc.status,
        content=body,
        media_type="application/problem+json",
        headers=exc.headers,
    )


# ---------- shortcuts ----------
def not_found(detail: str = "Resource not found") -> ProblemError:
    return ProblemError(status=404, code="NOT_FOUND", title="Not Found", detail=detail)


def forbidden(detail: str = "Action is not allowed for this role") -> ProblemError:
    return ProblemError(status=403, code="FORBIDDEN", title="Forbidden", detail=detail)


def unauthenticated(detail: str = "Missing or invalid token") -> ProblemError:
    return ProblemError(
        status=401, code="UNAUTHENTICATED", title="Unauthenticated", detail=detail
    )


def tenant_mismatch(
    detail: str = "Resource does not belong to the caller's tenant",
) -> ProblemError:
    return ProblemError(status=403, code="TENANT_MISMATCH", title="Tenant Mismatch", detail=detail)


def conflict(detail: str, *, code: str = "CONFLICT") -> ProblemError:
    return ProblemError(status=409, code=code, title="Conflict", detail=detail)


def validation_failed(detail: str, errors: list[dict[str, Any]] | None = None) -> ProblemError:
    return ProblemError(
        status=422,
        code="VALIDATION_FAILED",
        title="Validation Error",
        detail=detail,
        errors=errors,
    )


def upstream_failed(detail: str) -> ProblemError:
    return ProblemError(status=502, code="UPSTREAM_FAILED", title="Upstream Failed", detail=detail)


def upstream_timeout(detail: str = "External provider timed out") -> ProblemError:
    return ProblemError(
        status=504, code="UPSTREAM_TIMEOUT", title="Upstream Timeout", detail=detail
    )


def locked(detail: str = "Resource is locked") -> ProblemError:
    return ProblemError(status=423, code="LOCKED", title="Locked", detail=detail)
