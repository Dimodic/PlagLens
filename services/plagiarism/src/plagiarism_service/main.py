"""FastAPI app factory + entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError

from .api.deps import get_orchestrator, set_producer
from .api.v1 import api_router, health_router
from .common.logging import configure_logging, get_logger
from .common.problem import ProblemError, problem_response, validation_failed
from .config import settings
from .events.producer import EventProducer, NullEventProducer
from .scheduler import build_scheduler

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging(settings.log_level)
    producer: EventProducer = NullEventProducer()
    set_producer(producer)
    # Start the APScheduler tick that polls queued/running runs. Without
    # this, the only way a JPlag subprocess ever starts is "by accident"
    # — the API just enqueues a row and nothing ever picks it up. Symptom
    # was every plagiarism run sitting in ``queued`` indefinitely.
    scheduler = build_scheduler(get_orchestrator())
    scheduler.start()
    log.info("plagiarism_service.startup", env=settings.env)
    try:
        yield
    finally:
        log.info("plagiarism_service.shutdown")
        try:
            scheduler.shutdown(wait=False)
        except Exception as exc:  # noqa: BLE001
            log.warning("scheduler_shutdown_failed", error=str(exc))


def create_app() -> FastAPI:
    app = FastAPI(
        title="PlagLens — Plagiarism Service",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(health_router)
    app.include_router(api_router)

    @app.exception_handler(ProblemError)
    async def _problem_handler(request: Request, exc: ProblemError):  # type: ignore[override]
        return problem_response(request, exc)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError):  # type: ignore[override]
        problem = validation_failed(
            "Request body failed validation",
            errors=[
                {
                    "field": ".".join(str(p) for p in err.get("loc", [])),
                    "code": err.get("type", "invalid"),
                    "message": err.get("msg", ""),
                }
                for err in exc.errors()
            ],
        )
        return problem_response(request, problem)

    return app


app = create_app()


def run() -> None:  # entrypoint declared in pyproject.scripts
    import uvicorn

    uvicorn.run(
        "plagiarism_service.main:app",
        host="0.0.0.0",  # noqa: S104
        port=8080,
        reload=False,
    )
