"""FastAPI application entry-point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from integration_service import __version__
from integration_service.api.v1 import build_router
from integration_service.api.v1.health import router as health_router
from integration_service.common.kafka_bus import get_bus
from integration_service.common.problems import ProblemException, problem_response
from integration_service.config import get_settings
from integration_service.services.events_consumer import register as register_consumers
from integration_service.services.scheduler import start_scheduler, stop_scheduler


def configure_logging() -> None:
    s = get_settings()
    level = getattr(logging, s.log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")
    structlog.configure(
        wrapper_class=structlog.make_filtering_bound_logger(level),
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    s = get_settings()
    bus = get_bus()
    register_consumers(bus)
    if s.enable_kafka:
        await bus.start()
    if s.enable_scheduler:
        start_scheduler()
    try:
        yield
    finally:
        if s.enable_scheduler:
            stop_scheduler()
        await bus.stop()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="PlagLens Integration Service",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Versioned API
    api_router = build_router()
    app.include_router(api_router, prefix=s.api_prefix)

    # Top-level health endpoints (also exposed via /api/v1/healthz for tests).
    app.include_router(health_router)

    @app.exception_handler(ProblemException)
    async def _problem_handler(request: Request, exc: ProblemException) -> Any:
        return problem_response(
            status=exc.status_code,
            code=exc.code,
            title=exc.title,
            detail=exc.problem_detail,
            instance=str(request.url.path),
            errors=exc.errors,
            request_id=request.headers.get("X-Request-Id"),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(
        request: Request, exc: RequestValidationError
    ) -> Any:
        errors = [
            {
                "field": ".".join(str(p) for p in e.get("loc", [])),
                "code": e.get("type", "invalid"),
                "message": e.get("msg", ""),
            }
            for e in exc.errors()
        ]
        return problem_response(
            status=422,
            code="VALIDATION_FAILED",
            title="Validation Error",
            detail="request body validation failed",
            instance=str(request.url.path),
            errors=errors,
            request_id=request.headers.get("X-Request-Id"),
        )

    return app


app = create_app()


def run() -> None:
    """Console-script entry-point."""
    import uvicorn  # local import keeps boot cheap.

    uvicorn.run(
        "integration_service.main:app",
        host="0.0.0.0",
        port=8080,
        reload=False,
    )
