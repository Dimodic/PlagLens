"""Exception handlers — turn ProblemException into RFC 7807 JSON."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from submission_service.common.problem import ProblemException, problem_response


def _request_id(request: Request) -> str | None:
    rid = request.headers.get("X-Request-Id")
    if rid:
        return rid
    return getattr(request.state, "request_id", None)


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemException)
    async def _problem_handler(  # type: ignore[no-redef]
        request: Request, exc: ProblemException
    ) -> JSONResponse:
        return problem_response(
            status=exc.status_code,
            code=exc.code,
            title=exc.title,
            detail=str(exc.detail) if exc.detail else None,
            errors=exc.errors,
            instance=str(request.url.path),
            request_id=_request_id(request),
        )

    @app.exception_handler(RequestValidationError)
    async def _val_handler(  # type: ignore[no-redef]
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errs = [
            {"field": ".".join(str(p) for p in e.get("loc", [])), "code": e.get("type", ""), "message": e.get("msg", "")}
            for e in exc.errors()
        ]
        return problem_response(
            status=422,
            code="VALIDATION_FAILED",
            title="Validation Error",
            detail="Request validation failed",
            errors=errs,
            instance=str(request.url.path),
            request_id=_request_id(request),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_handler(  # type: ignore[no-redef]
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        code = "INTERNAL"
        title = "Error"
        if exc.status_code == 404:
            code, title = "NOT_FOUND", "Not Found"
        elif exc.status_code == 401:
            code, title = "UNAUTHENTICATED", "Unauthenticated"
        elif exc.status_code == 403:
            code, title = "FORBIDDEN", "Forbidden"
        elif exc.status_code == 409:
            code, title = "CONFLICT", "Conflict"
        elif exc.status_code == 413:
            code, title = "PAYLOAD_TOO_LARGE", "Payload Too Large"
        elif exc.status_code == 429:
            code, title = "RATE_LIMITED", "Too Many Requests"
        return problem_response(
            status=exc.status_code,
            code=code,
            title=title,
            detail=str(exc.detail) if exc.detail else None,
            instance=str(request.url.path),
            request_id=_request_id(request),
        )

    @app.exception_handler(Exception)
    async def _fallback(  # type: ignore[no-redef]
        request: Request, exc: Exception
    ) -> JSONResponse:
        return problem_response(
            status=500,
            code="INTERNAL",
            title="Internal Server Error",
            detail="An unexpected error occurred",
            instance=str(request.url.path),
            request_id=_request_id(request),
        )
