"""FastAPI application entry-point.

Wiring:
  - Idempotency middleware (Redis-backed; passthrough if missing)
  - Request-ID middleware
  - RFC 7807 problem+json exception handlers
  - Health (`/healthz`, `/readyz`, `/metrics`)
  - All /api/v1 routers
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import APIRouter, FastAPI, Request, Response
from plaglens_common.observability import install_observability
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .api.v1 import api_v1
from .common.events import KafkaProducer, StubProducer
from .common.idempotency import IdempotencyMiddleware
from .common.problem import make_handlers
from .config import settings
from .db import get_engine, get_session_factory

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Prometheus metrics
# --------------------------------------------------------------------------- #
_REGISTRY = CollectorRegistry()
HTTP_REQUESTS = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "route", "status"],
    registry=_REGISTRY,
)
HTTP_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "route"],
    registry=_REGISTRY,
)


# --------------------------------------------------------------------------- #
# Readiness checks (consumed by gateway + admin "System health" page)
# --------------------------------------------------------------------------- #
_READYZ_TIMEOUT_S = 2.0


async def _check_db() -> str:
    """Acquire a session and ``SELECT 1``. Returns ``"ok"`` or ``"fail: <Reason>"``."""
    try:
        factory = get_session_factory()

        async def _probe() -> None:
            async with factory() as session:
                await session.execute(text("SELECT 1"))

        await asyncio.wait_for(_probe(), timeout=_READYZ_TIMEOUT_S)
        return "ok"
    except Exception as exc:  # noqa: BLE001 - readyz must never raise
        return f"fail: {type(exc).__name__}"


async def _check_redis(app: FastAPI) -> str:
    """Ping the live Redis client. Returns ``"ok"`` or ``"fail: <Reason>"``.

    Redis is optional infra: when no client is wired (e.g. the server was
    unreachable at startup) we report a failure rather than a false ``ok``.
    """
    redis = getattr(app.state, "redis", None)
    if redis is None:
        return "fail: RedisUnavailable"
    try:
        await asyncio.wait_for(redis.ping(), timeout=_READYZ_TIMEOUT_S)
        return "ok"
    except Exception as exc:  # noqa: BLE001 - readyz must never raise
        return f"fail: {type(exc).__name__}"


# --------------------------------------------------------------------------- #
# Middlewares
# --------------------------------------------------------------------------- #
class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns ``X-Request-Id`` and tracks per-request metrics."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex
        request.state.request_id = rid
        method = request.method
        route = request.url.path
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            HTTP_REQUESTS.labels(method=method, route=route, status="500").inc()
            raise
        duration = time.perf_counter() - started
        HTTP_DURATION.labels(method=method, route=route).observe(duration)
        HTTP_REQUESTS.labels(
            method=method, route=route, status=str(response.status_code)
        ).inc()
        response.headers.setdefault("X-Request-Id", rid)
        return response


# --------------------------------------------------------------------------- #
# Lifespan: start/stop infra clients
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Redis (optional)
    redis_client = None
    try:
        import redis.asyncio as redis_asyncio  # type: ignore

        redis_client = redis_asyncio.from_url(
            settings.redis_url, encoding="utf-8", decode_responses=True
        )
        await redis_client.ping()
    except Exception as exc:  # pragma: no cover (depends on infra)
        logger.warning("Redis unavailable, continuing without it: %s", exc)
        redis_client = None
    app.state.redis = redis_client

    # Kafka producer (optional)
    if settings.kafka_brokers_list and settings.environment != "test":
        producer: KafkaProducer | StubProducer = KafkaProducer(
            settings.kafka_brokers_list
        )
    else:
        producer = StubProducer()
    await producer.start()
    app.state.producer = producer

    # DB engine
    app.state.engine = get_engine()

    # Warm the OAuth provider override cache from the DB so the very first
    # /auth/oauth/<provider>/authorize call uses admin-edited credentials,
    # not the env fallback.
    try:
        from .db import get_session_factory
        from .oauth import overrides as oauth_overrides

        session_factory = get_session_factory()
        async with session_factory() as session:
            loaded = await oauth_overrides.reload_from_db(session)
        if loaded:
            logger.info("OAuth overrides loaded for %d provider(s)", loaded)
    except Exception as exc:  # pragma: no cover (depends on DB)
        logger.warning("Failed to load OAuth overrides from DB: %s", exc)

    try:
        yield
    finally:
        try:
            await producer.stop()
        except Exception:  # pragma: no cover
            pass
        if redis_client is not None:
            try:
                await redis_client.close()
            except Exception:  # pragma: no cover
                pass


# --------------------------------------------------------------------------- #
# App factory
# --------------------------------------------------------------------------- #
def create_app() -> FastAPI:
    app = FastAPI(
        title="PlagLens Identity Service",
        version="0.1.0",
        description="Auth, users, tenants, RBAC, OAuth, 2FA, API keys.",
        lifespan=lifespan,
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url=None,
    )

    # Exception handlers (RFC 7807).
    for exc_type, handler in make_handlers().items():
        app.add_exception_handler(exc_type, handler)

    # Middlewares (outer first).
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(IdempotencyMiddleware, ttl_seconds=settings.idempotency_ttl_seconds)

    # Health & metrics live at the root, not under /api/v1, per cross-cutting §11.
    health = APIRouter(tags=["health"])

    @health.get("/healthz", summary="Liveness probe")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @health.get("/readyz", summary="Readiness probe")
    async def readyz(request: Request) -> Response:
        # Per-dependency checks consumed by the gateway parser + admin
        # "System health" page. Shape is contractual:
        #   {"status": "ok"|"degraded",
        #    "checks": {"db": "ok"|"fail: <Reason>", "redis": ...}}
        # 200 when every check passes, 503 otherwise. Each check is wrapped
        # so this endpoint can never raise, and bounded by a short timeout so
        # it stays fast under partial outages.
        checks = {
            "db": await _check_db(),
            "redis": await _check_redis(request.app),
        }
        ok = all(v == "ok" for v in checks.values())
        return JSONResponse(
            status_code=200 if ok else 503,
            content={"status": "ok" if ok else "degraded", "checks": checks},
        )

    @health.get("/metrics", summary="Prometheus metrics")
    async def metrics() -> Response:
        return Response(
            content=generate_latest(_REGISTRY),
            media_type=CONTENT_TYPE_LATEST,
        )

    app.include_router(health)
    app.include_router(api_v1)

    # OpenTelemetry traces -> Jaeger (metrics are served from identity's own
    # registry above; install_observability's metrics middleware is harmless).
    install_observability(app, service_name="identity")
    return app


app = create_app()


def run() -> None:
    """Entry-point for ``identity-service`` console script."""
    import uvicorn

    uvicorn.run(
        "identity_service.main:app",
        host="0.0.0.0",  # noqa: S104
        port=8080,
        reload=settings.environment == "local",
    )
