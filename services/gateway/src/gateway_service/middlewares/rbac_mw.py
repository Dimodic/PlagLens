"""Coarse-grained RBAC pre-check middleware.

Looks at request path → required global role; rejects with 403 if the
authenticated principal doesn't satisfy. Public/anonymous paths are skipped
because JWTMiddleware leaves principal=None there.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from gateway_service.errors import problem_response
from gateway_service.rbac import precheck


class RBACMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # noqa: D401
        if request.method == "OPTIONS":
            return await call_next(request)
        principal = getattr(request.state, "principal", None)
        allowed, code = precheck(principal, request.url.path)
        if not allowed:
            status = 401 if code == "UNAUTHENTICATED" else 403
            return problem_response(
                status=status,
                code=code or "FORBIDDEN",
                title="Forbidden" if status == 403 else "Unauthenticated",
                detail="Insufficient role for this endpoint",
                request=request,
            )
        return await call_next(request)


__all__ = ["RBACMiddleware"]
