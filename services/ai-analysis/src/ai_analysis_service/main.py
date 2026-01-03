"""FastAPI application factory + lifespan."""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .api import build_router
from .common.logging import configure_logging
from .common.problem import (
    Problem,
    ProblemException,
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

    @app.exception_handler(ProblemException)
    async def _problem_handler(request: Request, exc: ProblemException) -> JSONResponse:
        return problem_response(request, exc)

    @app.exception_handler(ValidationError)
    async def _validation_handler(
        request: Request, exc: ValidationError
    ) -> JSONResponse:
        from .common.problem import DOC_BASE

        body = Problem(
            type=f"{DOC_BASE}/validation_failed",
            title="Validation Error",
            status=422,
            detail=str(exc),
            instance=str(request.url.path),
            code="VALIDATION_FAILED",
            errors=[
                {"field": ".".join(map(str, e["loc"])), "message": e["msg"], "code": e["type"]}
                for e in exc.errors()
            ],
            request_id=getattr(request.state, "request_id", None),
        ).model_dump(exclude_none=True)
        return JSONResponse(status_code=422, content=body, media_type="application/problem+json")

    app.include_router(build_router())
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
