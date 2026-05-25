"""Gateway FastAPI app factory + entrypoint.

Middleware order (outermost → innermost) per 13-GATEWAY.md §«Middleware pipeline»:
    1.  RequestId
    2.  Tracing
    3.  Logging
    4.  CORS
    5.  BodySize
    6.  PerIP rate-limit (pre-auth)
    7.  JWT validation
    8.  RBAC global pre-check
    9.  PerUser rate-limit (post-auth)
   10.  Idempotency
   11.  Forward (handled by routers)
   12.  Response normalization (innermost wraps responses)

Note: Starlette adds middleware in LIFO so we register them bottom-up.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from plaglens_common.observability import install_observability
from starlette.exceptions import HTTPException as StarletteHTTPException

from gateway_service.api.v1 import (
    debug as debug_router,
)
from gateway_service.api.v1 import (
    health as health_router,
)
from gateway_service.api.v1 import (
    jwks as jwks_router,
)
from gateway_service.api.v1 import (
    operations as ops_router,
)
from gateway_service.api.v1 import (
    proxy_router,
)
from gateway_service.api.v1 import (
    search as search_router,
)
from gateway_service.api.v1 import (
    services_status as services_status_router,
)
from gateway_service.api.v1 import (
    system as system_router,
)
from gateway_service.api.v1 import (
    version as version_router,
)
from gateway_service.config import settings
from gateway_service.errors import (
    http_exception_handler,
    unhandled_exception_handler,
)
from gateway_service.logging import configure_logging, get_logger
from gateway_service.middlewares import (
    BodySizeLimitMiddleware,
    IdempotencyMiddleware,
    JWTMiddleware,
    LoggingMiddleware,
    NoCacheAPIMiddleware,
    PerIPRateLimitMiddleware,
    PerUserRateLimitMiddleware,
    RBACMiddleware,
    RequestIdMiddleware,
    ResponseNormalizationMiddleware,
    TracingMiddleware,
    build_cors_middleware,
)
from gateway_service.proxy.http_client import http_client_holder
from gateway_service.redis_client import redis_holder

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info("gateway_starting", env=settings.environment, version=settings.version)
    yield
    log.info("gateway_stopping")
    await http_client_holder.close()
    await redis_holder.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="PlagLens API Gateway",
        version=settings.version,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
    )

    # -- Routers (gateway-owned first; the universal proxy is a catch-all) --
    app.include_router(system_router.router)
    app.include_router(health_router.router)
    app.include_router(version_router.router)
    app.include_router(services_status_router.router)
    app.include_router(jwks_router.router)
    app.include_router(ops_router.router)
    # Federated search must be registered BEFORE the universal proxy so that
    # `/api/v1/search` is handled in-gateway (no routing-table entry needed).
    app.include_router(search_router.router)
    # Debug endpoint for client-side error reporting (public, no JWT).
    # Must be registered BEFORE proxy_router for the same reason.
    app.include_router(debug_router.router)
    app.include_router(proxy_router.router)

    # -- Middlewares (registered LAST → executed FIRST) --
    # Innermost wraps responses → registered first.
    # NoCacheAPIMiddleware sits inside everything so it sees the final
    # response after Response normalization and stamps Cache-Control
    # before anything else can touch it.
    app.add_middleware(NoCacheAPIMiddleware)
    app.add_middleware(ResponseNormalizationMiddleware)
    app.add_middleware(IdempotencyMiddleware)
    app.add_middleware(PerUserRateLimitMiddleware)
    app.add_middleware(RBACMiddleware)
    app.add_middleware(JWTMiddleware)
    app.add_middleware(PerIPRateLimitMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)

    # CORS — separate path because Starlette wants its own factory.
    cors_mw = build_cors_middleware()
    app.add_middleware(cors_mw.cls, **cors_mw.kwargs)

    app.add_middleware(LoggingMiddleware)
    app.add_middleware(TracingMiddleware)
    app.add_middleware(RequestIdMiddleware)

    # -- Exception handlers --
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # OpenTelemetry tracing only (gateway has its own Prometheus registry). The
    # bundled httpx instrumentation propagates W3C traceparent to backends, so
    # traces span gateway -> service end to end.
    install_observability(app, service_name="gateway", metrics=False)
    return app


app = create_app()


def run() -> None:  # pragma: no cover
    """Entry point for `gateway-service` console script."""
    import uvicorn

    uvicorn.run(
        "gateway_service.main:app",
        host="0.0.0.0",
        port=8080,
        log_level="info",
    )


__all__ = ["app", "create_app", "run"]
