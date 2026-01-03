"""Starlette middleware stack for the gateway."""

from gateway_service.middlewares.body_size import BodySizeLimitMiddleware
from gateway_service.middlewares.cors import build_cors_middleware
from gateway_service.middlewares.idempotency_mw import IdempotencyMiddleware
from gateway_service.middlewares.jwt_mw import JWTMiddleware
from gateway_service.middlewares.logging_mw import LoggingMiddleware
from gateway_service.middlewares.rate_limit_mw import (
    PerIPRateLimitMiddleware,
    PerUserRateLimitMiddleware,
)
from gateway_service.middlewares.rbac_mw import RBACMiddleware
from gateway_service.middlewares.request_id import RequestIdMiddleware
from gateway_service.middlewares.response_norm import ResponseNormalizationMiddleware
from gateway_service.middlewares.tracing_mw import TracingMiddleware

__all__ = [
    "BodySizeLimitMiddleware",
    "IdempotencyMiddleware",
    "JWTMiddleware",
    "LoggingMiddleware",
    "PerIPRateLimitMiddleware",
    "PerUserRateLimitMiddleware",
    "RBACMiddleware",
    "RequestIdMiddleware",
    "ResponseNormalizationMiddleware",
    "TracingMiddleware",
    "build_cors_middleware",
]
