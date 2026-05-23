"""FastAPI application factory + lifespan."""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from plaglens_common.observability import install_observability
from pydantic import ValidationError

from .api import build_router
from .common.logging import configure_logging
from .common.problem import (
    ProblemFieldError,
    make_handlers,
    problem_response,
)
from .config import get_settings
from .events.consumer import get_consumer, reset_consumer
from .events.producer import get_publisher, reset_publisher


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    publisher = get_publisher()
    consumer = get_consumer()
    await publisher.start()
    await consumer.start()
    try:
        yield
    finally:
        await consumer.stop()
        await publisher.stop()
        reset_publisher()
        reset_consumer()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="PlagLens AI Analysis Service",
        version=settings.VERSION,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def request_id_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[JSONResponse]],
    ) -> JSONResponse:
        rid = request.headers.get("x-request-id") or f"req_{uuid.uuid4().hex}"
        request.state.request_id = rid
        response = await call_next(request)
        response.headers.setdefault("X-Request-Id", rid)
        return response

    for _exc_type, _handler in make_handlers().items():
        app.add_exception_handler(_exc_type, _handler)

    @app.exception_handler(ValidationError)
    async def _pydantic_validation_handler(
        request: Request, exc: ValidationError
    ) -> JSONResponse:
        errors = [
            ProblemFieldError(
                field=".".join(map(str, e["loc"])), message=e["msg"], code=e["type"]
            )
            for e in exc.errors()
        ]
        return problem_response(
            request,
            status=422,
            code="VALIDATION_FAILED",
            title="Validation Error",
            detail=str(exc),
            errors=errors,
        )

    app.include_router(build_router())

    # Prometheus app metrics + OpenTelemetry traces -> Jaeger.
    install_observability(app, service_name="ai-analysis")
    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run(
        "ai_analysis_service.main:app",
        host="0.0.0.0",  # noqa: S104 — bind for in-cluster/container deployment
        port=8080,
        reload=False,
    )
