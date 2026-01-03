"""FastAPI application entrypoint for submission-service."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from submission_service.api.errors import install_exception_handlers
from submission_service.api.middleware import install_middleware, metrics_response
from submission_service.api.routers import (
    bulk,
    feedback,
    flags,
    grading,
    health,
    self_service,
    submissions,
)
from submission_service.common.logging import configure_logging
from submission_service.config import get_settings
from submission_service.events.consumer import get_consumer
from submission_service.events.producer import get_publisher


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
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


def create_app() -> FastAPI:
    app = FastAPI(
        title="PlagLens Submission Service",
        version=get_settings().VERSION,
        lifespan=lifespan,
    )
    install_middleware(app)
    install_exception_handlers(app)

    app.include_router(health.router)
    app.add_api_route("/metrics", metrics_response, methods=["GET"], include_in_schema=False)

    base = "/api/v1"
    app.include_router(submissions.router, prefix=base, tags=["submissions"])
    app.include_router(grading.router, prefix=base, tags=["grading"])
    app.include_router(feedback.router, prefix=base, tags=["feedback"])
    app.include_router(flags.router, prefix=base, tags=["flags"])
    app.include_router(self_service.router, prefix=base, tags=["self-service"])
    app.include_router(bulk.router, prefix=base, tags=["bulk"])
    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("submission_service.main:app", host="0.0.0.0", port=8080)  # noqa: S104


if __name__ == "__main__":
    run()
