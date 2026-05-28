"""FastAPI app factory + lifespan."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from pydantic import ValidationError

from notification_service.api.health import router as health_router
from notification_service.api.v1 import router as v1_router
from notification_service.config import get_settings
from notification_service.consumers import KafkaDispatcher
from notification_service.db import dispose_engine, init_engine
from notification_service.delivery import close_channels, init_channels
from notification_service.digest import setup_scheduler
from notification_service.errors import make_handlers, pydantic_validation_handler
from notification_service.logging import configure_logging, get_logger
from notification_service.redis_bus import close_redis, init_redis


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    log = get_logger("startup")
    settings = get_settings()
    init_engine()
    init_redis()
    init_channels()
    # Hot-load per-tenant EmailTransportConfig if a row exists — otherwise
    # the channel stays on env defaults until the admin clicks Save in the
    # UI, which would silently break verification email on reboot.
    try:
        await _bootstrap_email_channel_from_db()
    except Exception as e:  # noqa: BLE001
        log.warning("email_channel_db_bootstrap_failed", error=str(e))
    dispatcher = KafkaDispatcher()
    scheduler = None
    if not settings.SCHEDULER_DISABLED:
        scheduler = setup_scheduler()
        if scheduler is not None:
            try:
                scheduler.start()
            except Exception as e:  # noqa: BLE001
                log.warning("scheduler_start_failed", error=str(e))
                scheduler = None
    try:
        await dispatcher.start()
    except Exception as e:  # noqa: BLE001
        log.warning("dispatcher_start_failed", error=str(e))
    log.info("notification_service_ready")
    try:
        yield
    finally:
        try:
            await dispatcher.stop()
        except Exception:
            pass
        if scheduler is not None:
            try:
                scheduler.shutdown(wait=False)
            except Exception:
                pass
        await close_channels()
        await close_redis()
        await dispose_engine()


async def _bootstrap_email_channel_from_db() -> None:
    """At startup, fold any persisted EmailTransportConfig into the live channel.

    Without this, every container restart silently demotes the email
    transport to env defaults (typically Mailhog) — even if the admin
    has saved Yandex SMTP through the UI. We pick the most-recently-
    updated row (the admin only edits one per tenant); for a fresh DB
    with no row the function is a no-op and the env-built channel stays
    in place.
    """
    from sqlalchemy import desc, select

    from notification_service.api.v1.admin_email import _build_channel_from_cfg
    from notification_service.db import get_session_factory
    from notification_service.delivery import reset_email_channel
    from notification_service.models import EmailTransportConfig

    SessionLocal = get_session_factory()
    async with SessionLocal() as db:
        stmt = (
            select(EmailTransportConfig)
            .order_by(desc(EmailTransportConfig.updated_at))
            .limit(1)
        )
        res = await db.execute(stmt)
        cfg = res.scalars().first()
        if cfg is None:
            return
        await reset_email_channel(_build_channel_from_cfg(cfg))


def create_app() -> FastAPI:
    app = FastAPI(
        title="PlagLens Notification Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def _request_id_mw(request: Request, call_next):  # type: ignore[no-untyped-def]
        rid = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = rid
        response = await call_next(request)
        response.headers.setdefault("X-Request-Id", rid)
        return response

    for _exc_type, _handler in make_handlers().items():
        app.add_exception_handler(_exc_type, _handler)
    app.add_exception_handler(ValidationError, pydantic_validation_handler)

    app.include_router(health_router)
    app.include_router(v1_router)
    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run(
        "notification_service.main:app",
        host="0.0.0.0",  # noqa: S104
        port=8080,
        reload=False,
    )
