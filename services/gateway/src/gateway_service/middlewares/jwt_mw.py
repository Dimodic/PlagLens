"""JWT validation middleware.

Skips public paths/prefixes; otherwise requires a valid Bearer token.
Caches the parsed `Principal` in `request.state.principal`.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from gateway_service.auth import JWTError, validate_token
from gateway_service.config import PUBLIC_PATHS, PUBLIC_PREFIXES
from gateway_service.errors import problem_response


def _is_public(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    # Gateway-owned read-only public endpoints
    if path in {"/v1/health", "/v1/version", "/v1/.well-known/jwks.json"}:
        return True
    for pref in PUBLIC_PREFIXES:
        if path.startswith(pref):
            return True
    return False


# Paths that may carry the JWT as ``?access_token=`` query param.
#
# Browser EventSource() can't set custom headers, so SSE clients have to
# resort to the URL query string. The risk surface is small: these paths
# stream read-only events scoped to the authenticated principal, and the
# token is short-lived (15 min) — so even if a token leaks via referer /
# server logs the blast radius is bounded.
_QUERY_TOKEN_PATHS: tuple[str, ...] = (
    "/v1/notifications/stream",
    "/api/v1/notifications/stream",
)


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    if request.url.path in _QUERY_TOKEN_PATHS:
        qp = request.query_params.get("access_token")
        if qp:
            return qp.strip()
    return None


class JWTMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # noqa: D401
        if request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        if _is_public(path):
            request.state.principal = None
            return await call_next(request)

        token = _extract_token(request)
        if not token:
            return problem_response(
                status=401,
                code="UNAUTHENTICATED",
                title="Unauthenticated",
                detail="Missing bearer token",
                request=request,
            )
        try:
            principal = await validate_token(token)
        except JWTError as e:
            return problem_response(
                status=e.status,
                code=e.code,
                title="Unauthenticated" if e.status == 401 else "Forbidden",
                detail=e.detail,
                request=request,
            )
        except Exception:
            return problem_response(
                status=401,
                code="UNAUTHENTICATED",
                title="Unauthenticated",
                detail="token_validation_failed",
                request=request,
            )
        request.state.principal = principal
        return await call_next(request)


__all__ = ["JWTMiddleware"]
