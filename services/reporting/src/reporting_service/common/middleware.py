"""Request-id middleware + RFC 7807 exception handlers."""
from __future__ import annotations

import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware

from .problem import Problem, problem_response


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(Problem)
    async def _problem_handler(request: Request, exc: Problem):
        return problem_response(
            exc,
            instance=str(request.url.path),
            request_id=getattr(request.state, "request_id", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError):
        errors = [
            {
                "field": ".".join(str(p) for p in e.get("loc", []) if p not in ("body", "query")),
                "code": e.get("type", "invalid"),
                "message": e.get("msg", "invalid"),
            }
            for e in exc.errors()
        ]
        p = Problem(422, "VALIDATION_FAILED", "Validation Error", "Invalid request", errors=errors)
        return problem_response(
            p, instance=str(request.url.path), request_id=getattr(request.state, "request_id", None)
        )

    @app.exception_handler(Exception)
    async def _generic_handler(request: Request, exc: Exception):  # pragma: no cover - safety net
        p = Problem(500, "INTERNAL", "Internal", str(exc) or "internal")
        return problem_response(
            p, instance=str(request.url.path), request_id=getattr(request.state, "request_id", None)
        )
