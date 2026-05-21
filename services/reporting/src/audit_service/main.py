"""FastAPI application for the Audit Service."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from .api.v1.admin import router as admin_router
from .api.v1.events import router as events_router
from .api.v1.events import shortcut_router
from .api.v1.health import router as health_router
from .api.v1.internal import router as internal_router
from .common.logging import configure_logging, get_logger
from .common.problem import make_handlers
from .config import settings
from .db import get_engine, get_session_factory

log = get_logger("audit.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info("audit.startup", env=settings.environment)

    # Eager-create engine + session factory.
    get_engine()
    factory = get_session_factory()

    consumer = None
    scheduler = None
    if settings.run_background_jobs:
        if not settings.kafka_disabled:
            try:
                from .services.consumer import AuditKafkaConsumer

                consumer = AuditKafkaConsumer(factory)
                await consumer.start()
                app.state.consumer = consumer
            except Exception as exc:  # noqa: BLE001
                log.warning("audit.startup.consumer_failed", error=str(exc))

        if not settings.scheduler_disabled:
            try:
                from .services.scheduler import AuditScheduler

                scheduler = AuditScheduler(get_engine(), factory)
                await scheduler.start()
                app.state.scheduler = scheduler
            except Exception as exc:  # noqa: BLE001
                log.warning("audit.startup.scheduler_failed", error=str(exc))

    try:
        yield
    finally:
        if consumer is not None:
            await consumer.stop()
        if scheduler is not None:
            await scheduler.stop()
        try:
            await get_engine().dispose()
        except Exception:  # noqa: BLE001
            pass


def create_app() -> FastAPI:
    app = FastAPI(
        title="PlagLens Audit Service",
        version=settings.version,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def _request_id_mw(request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex
        request.state.request_id = rid
        response = await call_next(request)
        response.headers.setdefault("X-Request-Id", rid)
        return response

    for exc_type, handler in make_handlers().items():
        app.add_exception_handler(exc_type, handler)

    app.include_router(health_router)
    app.include_router(events_router, prefix="/api/v1")
    app.include_router(shortcut_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(internal_router, prefix="/api/v1")
    return app


app = create_app()


def run() -> None:
    """`audit-service` entrypoint (uvicorn)."""
    import uvicorn

    uvicorn.run("audit_service.main:app", host="0.0.0.0", port=8080)
