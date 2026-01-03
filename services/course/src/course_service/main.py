"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .api import (
    assignments as assignments_api,
)
from .api import (
    courses as courses_api,
)
from .api import (
    discovery as discovery_api,
)
from .api import (
    groups as groups_api,
)
from .api import (
    health as health_api,
)
from .api import (
    homeworks as homeworks_api,
)
from .api import (
    members as members_api,
)
from .common.events import KafkaProducer
from .common.idempotency import IdempotencyMiddleware
from .common.problem import (
    problem_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from .common.redis_client import RedisClient
from .common.request_id import RequestIdMiddleware
from .config import Settings, get_settings
from .deps import _engine_cache
from .events.consumer import IdentityEventsConsumer
from .events.producer import CourseEventPublisher

logger = structlog.get_logger(__name__)


def _configure_logging(level: str) -> None:
    logging.basicConfig(level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        cache_logger_on_first_use=True,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    _configure_logging(settings.log_level)

    # DB engine + session factory.
    engine = create_async_engine(settings.database_url, future=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    _engine_cache["engine"] = engine
    _engine_cache["factory"] = factory

    # Kafka producer + publisher.
    producer = KafkaProducer(settings.kafka_brokers, enabled=settings.kafka_enabled)
    await producer.start()
    publisher = CourseEventPublisher(producer, settings)

    # Redis (best-effort).
    redis = RedisClient(settings.redis_url, enabled=settings.redis_enabled)

    # Identity-events consumer.
    consumer = IdentityEventsConsumer(settings, factory)
    await consumer.start()

    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = factory
    app.state.kafka_producer = producer
    app.state.publisher = publisher
    app.state.redis = redis
    app.state.consumer = consumer

    try:
        yield
    finally:
        await consumer.stop()
        await producer.stop()
        await redis.aclose()
        await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="PlagLens Course Service",
        version=__version__,
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )

    # ---- Middleware (order: outermost first) -------------------------------
    app.add_middleware(IdempotencyMiddleware)
    app.add_middleware(RequestIdMiddleware)

    # ---- Exception handlers (RFC 7807) -------------------------------------
    app.add_exception_handler(StarletteHTTPException, problem_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # ---- Routers -----------------------------------------------------------
    app.include_router(health_api.router)
    app.include_router(courses_api.router)
    app.include_router(members_api.courses_member_router)
    app.include_router(members_api.invites_router)
    app.include_router(members_api.join_router)
    app.include_router(groups_api.router)
    app.include_router(homeworks_api.course_homeworks_router)
    app.include_router(homeworks_api.flat_router)
    app.include_router(assignments_api.course_assignments_router)
    app.include_router(assignments_api.flat_router)
    app.include_router(discovery_api.router)
    return app


# Default app for `uvicorn course_service.main:app`.
app = create_app()
