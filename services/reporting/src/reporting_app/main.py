"""Combined FastAPI app for the merged reporting + audit + notification service.

Design (mirrors the course-submission merge, adapted to 3 independent services):

* Each sub-service keeps its OWN Postgres schema, async engine, Kafka consumer
  group and background jobs. We do not force a shared engine — the three are
  schema-isolated and only ever talked to each other over two HTTP hops.
* We mount all three router sets (their *business* routers; each service's own
  health/metrics/version router is dropped in favour of ONE shared health
  surface) and register the shared RFC 7807 handlers once.
* We drive each sub-service's OWN lifespan against THIS app via an
  ``AsyncExitStack``. audit + notification initialise their module-level engines
  / consumers; reporting populates ``app.state.*`` (its deps read
  ``request.app.state``) — so reporting runs LAST, ensuring its state keys win
  any shared key (e.g. ``state.scheduler`` / ``state.consumer``).
* The two internal hops stay as in-container loopback HTTP: reporting's
  ``AUDIT_SERVICE_BASE_URL`` and audit's ``REPORTING_BASE_URL`` point at this
  service, so no cross-container network call remains.

The source packages (reporting_service, audit_service, notification_service)
live on as importable libraries.
"""

from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import APIRouter, FastAPI
from plaglens_common.health import health_router
from plaglens_common.observability import install_observability
from plaglens_common.problem import make_handlers
from pydantic import ValidationError
from sqlalchemy import text

from audit_service.api.v1.admin import router as _audit_admin_router
from audit_service.api.v1.events import router as _audit_events_router
from audit_service.api.v1.events import shortcut_router as _audit_shortcut_router
from audit_service.api.v1.internal import router as _audit_internal_router

# Module-level sub-apps (already built at import) — we reuse their lifespans.
from audit_service.main import app as _audit_app
from notification_service.api.v1 import router as _notification_v1_router
from notification_service.errors import pydantic_validation_handler
from notification_service.main import app as _notification_app
from reporting_service.api.v1 import (
    audit_proxy as _rep_audit_proxy,
)
from reporting_service.api.v1 import (
    dashboards_course as _rep_dash_course,
)
from reporting_service.api.v1 import (
    dashboards_global as _rep_dash_global,
)
from reporting_service.api.v1 import (
    dashboards_self as _rep_dash_self,
)
from reporting_service.api.v1 import (
    dashboards_tenant as _rep_dash_tenant,
)
from reporting_service.api.v1 import (
    exports as _rep_exports,
)
from reporting_service.api.v1 import (
    google_sheets as _rep_sheets,
)
from reporting_service.api.v1 import (
    operations as _rep_operations,
)
from reporting_service.api.v1 import (
    read_models as _rep_read_models,
)
from reporting_service.api.v1 import (
    scheduled as _rep_scheduled,
)
from reporting_service.main import app as _reporting_app

API_BASE = "/api/v1"


def _reporting_business_router() -> APIRouter:
    """Reporting's /api/v1 router WITHOUT its per-service health sub-router
    (health is served once by the shared health_router below)."""
    r = APIRouter(prefix=API_BASE)
    r.include_router(_rep_exports.router)
    r.include_router(_rep_operations.router)
    r.include_router(_rep_sheets.router)
    r.include_router(_rep_scheduled.router)
    r.include_router(_rep_dash_course.router)
    r.include_router(_rep_dash_tenant.router)
    r.include_router(_rep_dash_global.router)
    r.include_router(_rep_dash_self.router)
    r.include_router(_rep_read_models.router)
    r.include_router(_rep_audit_proxy.router)
    return r


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run all three sub-services' lifespans against this app.

    Order matters: reporting LAST so its ``app.state.*`` (read by reporting's
    deps) is the final value of any shared state key. AsyncExitStack unwinds in
    reverse on shutdown.
    """
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(_audit_app.router.lifespan_context(app))
        await stack.enter_async_context(_notification_app.router.lifespan_context(app))
        await stack.enter_async_context(_reporting_app.router.lifespan_context(app))
        yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="PlagLens Reporting Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Shared RFC 7807 handlers (all three services' ProblemException types are
    # subclasses of the canonical one) + notification's raw-ValidationError
    # handler (the shared set only covers FastAPI's RequestValidationError).
    for exc_type, handler in make_handlers().items():
        app.add_exception_handler(exc_type, handler)
    app.add_exception_handler(ValidationError, pydantic_validation_handler)

    # --- Reporting (business routers; self-prefixed under /api/v1) -----------
    app.include_router(_reporting_business_router())

    # --- Audit (each mounted under /api/v1) ---------------------------------
    app.include_router(_audit_events_router, prefix=API_BASE)
    app.include_router(_audit_shortcut_router, prefix=API_BASE)
    app.include_router(_audit_admin_router, prefix=API_BASE)
    app.include_router(_audit_internal_router, prefix=API_BASE)

    # --- Notification (v1 router already prefixed /api/v1, health-free) ------
    app.include_router(_notification_v1_router)

    # --- Single shared health/metrics/version surface -----------------------
    # Real readiness probes for the gateway's /readyz. The reporting sub-service
    # populates ``app.state.session_maker`` / ``app.state.redis`` during its
    # lifespan (which runs LAST in ``lifespan`` above), so both closures read
    # state at call time. Each owns its try/except and returns a bool — never
    # raises — so a single failing dependency yields a 503 with that check
    # marked "fail", not a 500. (Postgres reachable via one ``SELECT 1`` — the
    # audit/notification/reporting schemas share one server.)
    async def _check_db() -> bool:
        try:
            session_maker = getattr(app.state, "session_maker", None)
            if session_maker is None:
                return False

            async def _probe() -> None:
                async with session_maker() as session:
                    await session.execute(text("SELECT 1"))

            await asyncio.wait_for(_probe(), timeout=2.0)
            return True
        except Exception:
            return False

    async def _check_redis() -> bool:
        try:
            redis = getattr(app.state, "redis", None)
            if redis is None:
                return False
            await asyncio.wait_for(redis.ping(), timeout=1.0)
            return True
        except Exception:
            return False

    app.include_router(
        health_router(
            service_name="reporting",
            version="0.1.0",
            checks={"db": _check_db, "redis": _check_redis},
        )
    )

    # Real app metrics (Prometheus) + traces (OpenTelemetry -> Jaeger).
    install_observability(app, service_name="reporting")
    return app


app = create_app()


__all__ = ["app", "create_app", "lifespan"]
