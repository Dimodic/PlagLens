"""FastAPI application factory + ASGI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from . import __version__
from .api.v1 import build_v1_router
from .common.idempotency import IdempotencyStore
from .common.middleware import RequestIdMiddleware, install_exception_handlers
from .config import Settings, get_settings
from .events.consumer import EventConsumer
from .events.producer import EventProducer
from .exports.formats.google_sheets import GoogleApiClient, InMemoryGoogleSheetsClient
from .logging import setup_logging
from .read_models.handlers import build_handler_registry
from .scheduling.scheduler import ReportingScheduler
from .services.audit_proxy import HttpAuditProxy, InMemoryAuditProxy
from .services.export_service import ExportService
from .storage import InMemoryStorage, MinioStorage


def _build_redis(settings: Settings):
    try:
        import redis.asyncio as aioredis  # type: ignore

        return aioredis.from_url(settings.redis_url, decode_responses=True)
    except Exception:
        try:
            import fakeredis.aioredis as fakeredis  # type: ignore

            return fakeredis.FakeRedis(decode_responses=True)
        except Exception:  # pragma: no cover
            return _MemoryRedis()


class _MemoryRedis:
    """Tiny in-memory async redis stand-in. Final fallback only."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    async def get(self, key: str):
        return self.data.get(key)

    async def set(self, key: str, value: Any, ex: int | None = None):
        self.data[key] = value if isinstance(value, str) else value.decode() if isinstance(value, bytes) else str(value)

    async def delete(self, *keys: str):
        for k in keys:
            self.data.pop(k, None)

    async def ping(self) -> bool:
        return True


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = create_async_engine(settings.database_url, echo=False, future=True)
        session_maker = async_sessionmaker(engine, expire_on_commit=False)

        redis_client = _build_redis(settings)
        storage = (
            MinioStorage(
                settings.minio_endpoint,
                settings.minio_access_key,
                settings.minio_secret_key,
                settings.minio_secure,
                public_endpoint=settings.minio_public_endpoint,
            )
            if settings.minio_endpoint and settings.minio_endpoint != "memory"
            else InMemoryStorage()
        )
        producer = EventProducer(settings.kafka_bootstrap)
        await producer.start()
        # Resolve the service-account JSON once, from either env-inline or
        # the path env (docker secrets style). When unavailable we still
        # boot — but every Google Sheets path explicitly refuses rather
        # than silently writing to an in-memory stub (the old behaviour
        # made successful-looking "Готово" exports that never reached
        # the real spreadsheet).
        sa_json = settings.resolved_google_sa_json()
        sheets_client = (
            GoogleApiClient(sa_json) if sa_json else InMemoryGoogleSheetsClient()
        )
        export_service = ExportService(
            session_maker=session_maker,
            storage=storage,
            producer=producer,
            sheets_client=sheets_client,
            settings=settings,
        )
        idempotency = IdempotencyStore(redis_client, namespace=f"{settings.redis_prefix}:idem")
        consumer = EventConsumer(session_maker, build_handler_registry())
        await consumer.start(settings.kafka_bootstrap)
        scheduler = ReportingScheduler(
            session_maker,
            run_export=lambda sched, period_start, sess: _run_scheduled_export(
                export_service, sched, period_start, sess
            ),
        )
        await scheduler.start()
        audit_proxy = (
            HttpAuditProxy(settings.audit_service_base_url)
            if settings.audit_service_base_url and settings.audit_service_base_url != "memory"
            else InMemoryAuditProxy()
        )

        app.state.settings = settings
        app.state.engine = engine
        app.state.session_maker = session_maker
        app.state.redis = redis_client
        app.state.storage = storage
        app.state.kafka = producer
        app.state.consumer = consumer
        app.state.export_service = export_service
        app.state.sheets_client = sheets_client
        # True only when a real Google service-account JSON is in hand —
        # endpoints / the writer use this to refuse instead of pretending
        # to write to a stub.
        app.state.sheets_configured = bool(sa_json)
        app.state.idempotency = idempotency
        app.state.scheduler = scheduler
        app.state.audit_proxy = audit_proxy

        try:
            yield
        finally:
            await producer.stop()
            await consumer.stop()
            await scheduler.stop()
            await engine.dispose()

    app = FastAPI(
        title="PlagLens Reporting Service",
        version=__version__,
        lifespan=lifespan,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        redoc_url=None,
    )
    app.add_middleware(RequestIdMiddleware)
    install_exception_handlers(app)
    app.include_router(build_v1_router())
    return app


async def _run_scheduled_export(svc: ExportService, sched, period_start, session) -> str:
    """Helper used by the scheduler — creates a job, persists, fires worker."""
    import asyncio

    job = await svc.create(
        session,
        tenant_id=sched.tenant_id,
        triggered_by=sched.created_by,
        kind=sched.kind,
        fmt=sched.fmt,
        scope={**(sched.scope or {}), "schedule_id": sched.id, "period_start": period_start.isoformat()},
        options={},
    )
    # Grade exports need an authenticated identity to fetch live grades
    # from the course + submission services; there's no incoming request
    # to crib a token from, so mint one *as the binding's creator* via
    # identity-service. Other export kinds run off local read-models and
    # don't need a token — keep ``None`` for them.
    bearer: str | None = None
    if sched.kind == "assignment_grades":
        from .services.user_token import mint_user_token

        access = await mint_user_token(
            user_id=sched.created_by, tenant_id=sched.tenant_id
        )
        bearer = f"Bearer {access}" if access else None
    asyncio.create_task(svc.run_now(job.id, bearer_token=bearer))
    return job.id


app = create_app()


def run() -> None:  # pragma: no cover - CLI entrypoint
    import uvicorn

    uvicorn.run("reporting_service.main:app", host="0.0.0.0", port=8080)
