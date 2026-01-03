"""CORS configuration. Per-tenant allowlist is read from JWT (out of scope for
phase 1); meanwhile we use a static default allowlist from settings."""

from __future__ import annotations

from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

from gateway_service.config import settings


def build_cors_middleware() -> Middleware:
    return Middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_default_origins),
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"),
        allow_headers=(
            "Authorization",
            "Content-Type",
            "Idempotency-Key",
            "X-Request-Id",
            "X-Tenant-Hint",
            "Accept-Language",
            "If-None-Match",
        ),
        expose_headers=(
            "X-Request-Id",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "Retry-After",
            "Location",
            "ETag",
        ),
        max_age=600,
    )


__all__ = ["build_cors_middleware"]
