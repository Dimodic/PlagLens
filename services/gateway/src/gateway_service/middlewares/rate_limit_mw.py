"""Per-IP (pre-auth) and per-user (post-auth) rate-limit middlewares."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from gateway_service.config import settings
from gateway_service.errors import problem_response
from gateway_service.metrics import rate_limit_hits_total
from gateway_service.rate_limit import RateLimitPolicy, check
from gateway_service.redis_client import get_redis
from gateway_service.routing.table import match


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


def _endpoint_class_for(path: str) -> str:
    r = match(path)
    return r.endpoint_class if r else "default"


class PerIPRateLimitMiddleware(BaseHTTPMiddleware):
    """Coarse per-IP limit applied to *every* request (pre-auth)."""

    async def dispatch(self, request: Request, call_next):  # noqa: D401
        # Skip OPTIONS and gateway-only health endpoints
        if request.method == "OPTIONS" or request.url.path in {"/healthz", "/readyz", "/metrics"}:
            return await call_next(request)
        try:
            redis = await get_redis()
        except Exception:
            return await call_next(request)
        ip = _client_ip(request)
        policy = RateLimitPolicy.per_minute(settings.rate_limit_per_ip_rpm)
        decision = await check(redis, dimension="ip", identity=ip, policy=policy)
        if not decision.allowed:
            rate_limit_hits_total.labels(tier="ip").inc()
            return problem_response(
                status=429,
                code="RATE_LIMITED",
                title="Rate Limited",
                detail="Too many requests from this IP",
                request=request,
                headers={
                    "Retry-After": str(max(1, decision.reset_at - int(__import__('time').time()))),
                    "X-RateLimit-Limit": str(decision.limit),
                    "X-RateLimit-Remaining": str(decision.remaining),
                    "X-RateLimit-Reset": str(decision.reset_at),
                },
            )
        response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Limit", str(decision.limit))
        response.headers.setdefault("X-RateLimit-Remaining", str(decision.remaining))
        response.headers.setdefault("X-RateLimit-Reset", str(decision.reset_at))
        return response


class PerUserRateLimitMiddleware(BaseHTTPMiddleware):
    """Per-user + endpoint-class limit applied after JWT validation."""

    async def dispatch(self, request: Request, call_next):  # noqa: D401
        principal = getattr(request.state, "principal", None)
        # No principal → skip; per-IP middleware already handled this case.
        if principal is None or not getattr(principal, "user_id", None):
            return await call_next(request)
        try:
            redis = await get_redis()
        except Exception:
            return await call_next(request)

        path = request.url.path
        method = request.method.upper()
        klass = _endpoint_class_for(path)

        # Choose policy
        if klass == "auth_sensitive":
            policy = RateLimitPolicy.per_minute(settings.rate_limit_auth_rpm)
            tier = "auth_sensitive"
        elif klass == "run":
            policy = RateLimitPolicy.per_hour(settings.rate_limit_run_rph)
            tier = "run"
        elif method in {"POST", "PATCH", "PUT", "DELETE"}:
            policy = RateLimitPolicy.per_minute(settings.rate_limit_write_rpm)
            tier = "write"
        else:
            policy = RateLimitPolicy.per_minute(settings.rate_limit_per_user_rpm)
            tier = "user"

        ident = f"{principal.user_id}:{tier}"
        decision = await check(redis, dimension="user", identity=ident, policy=policy)
        if not decision.allowed:
            rate_limit_hits_total.labels(tier=tier).inc()
            import time as _t
            return problem_response(
                status=429,
                code="RATE_LIMITED",
                title="Rate Limited",
                detail="Too many requests",
                request=request,
                headers={
                    "Retry-After": str(max(1, decision.reset_at - int(_t.time()))),
                    "X-RateLimit-Limit": str(decision.limit),
                    "X-RateLimit-Remaining": str(decision.remaining),
                    "X-RateLimit-Reset": str(decision.reset_at),
                },
            )
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(decision.limit)
        response.headers["X-RateLimit-Remaining"] = str(decision.remaining)
        response.headers["X-RateLimit-Reset"] = str(decision.reset_at)
        return response


__all__ = ["PerIPRateLimitMiddleware", "PerUserRateLimitMiddleware"]
