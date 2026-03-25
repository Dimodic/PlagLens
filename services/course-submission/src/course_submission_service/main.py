"""Combined FastAPI app for the merged course+submission service.

Mounts the existing course and submission routers into one app, registers the
shared RFC 7807 handlers, and wires a single DB engine + the in-process
CourseClient so submission reads course data in-process (no cross-service HTTP).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import course_service.api._helpers as course_helpers
import course_service.deps as course_deps
import submission_service.api.deps as submission_api_deps
import submission_service.db as submission_db
from course_service.api import assignments as course_assignments
from course_service.api import courses as course_courses
from course_service.api import discovery as course_discovery
from course_service.api import groups as course_groups
from course_service.api import homeworks as course_homeworks
from course_service.api import members as course_members
from course_service.common.events import KafkaProducer
from course_service.common.redis_client import RedisClient
from course_service.config import get_settings as get_course_settings
from course_service.events.consumer import IdentityEventsConsumer
from course_service.events.producer import CourseEventPublisher
from fastapi import FastAPI
from plaglens_common.health import health_router
from plaglens_common.problem import make_handlers
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from submission_service.api.routers import bulk as submission_bulk
from submission_service.api.routers import feedback as submission_feedback
from submission_service.api.routers import flags as submission_flags
from submission_service.api.routers import grading as submission_grading
from submission_service.api.routers import self_service as submission_self_service
from submission_service.api.routers import submissions as submission_submissions
from submission_service.events.consumer import get_consumer as submission_get_consumer
from submission_service.events.producer import get_publisher as submission_get_publisher

from .course_client import InProcessCourseClient

API_BASE = "/api/v1"


def wire_shared_session(factory: async_sessionmaker[Any]) -> None:
    """Point both services' session machinery at one factory, and replace
    submission's HTTP CourseClient with the in-process one.

    This is the heart of the merge: course and submission now share a single
    engine (two Postgres schemas, one connection pool) and submission resolves
    assignment metadata by reading course tables directly.
    """
    course_deps.configure_session_factory(factory)
    submission_db.set_session_factory(factory)
    submission_api_deps.set_course_client(InProcessCourseClient(factory))


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_course_settings()
    # submission's ORM is unqualified — it resolves table names via the
    # connection's search_path; course is always schema-qualified to "course".
    # Pin search_path on every connection so correctness does not depend on the
    # DB role's default search_path.
    engine = create_async_engine(
        settings.database_url,
        future=True,
        connect_args={"server_settings": {"search_path": "submission,public"}},
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    wire_shared_session(factory)

    # Course-side Kafka/Redis (mirrors course's own lifespan).
    producer = KafkaProducer(settings.kafka_brokers, enabled=settings.kafka_enabled)
    await producer.start()
    publisher = CourseEventPublisher(producer, settings)
    # Course route handlers resolve the publisher via a module-level singleton
    # (course_service.api._helpers.get_publisher), which otherwise lazily builds
    # an UNSTARTED producer that silently no-ops. Inject the started publisher so
    # course/assignment events actually reach Kafka.
    course_helpers.configure_publisher(publisher)
    redis = RedisClient(settings.redis_url, enabled=settings.redis_enabled)
    consumer = IdentityEventsConsumer(settings, factory)
    await consumer.start()
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = factory
    app.state.kafka_producer = producer
    app.state.publisher = publisher
    app.state.redis = redis
    app.state.consumer = consumer

    # Submission-side Kafka (module singletons).
    sub_publisher = submission_get_publisher()
    sub_consumer = submission_get_consumer()
    await sub_publisher.start()
    await sub_consumer.start()

    try:
        yield
    finally:
        await consumer.stop()
        await producer.stop()
        await redis.aclose()
        await sub_consumer.stop()
        await sub_publisher.stop()
        await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(title="PlagLens Course+Submission Service", version="0.1.0", lifespan=lifespan)

    for exc_type, handler in make_handlers().items():
        app.add_exception_handler(exc_type, handler)

    # --- Course routers (self-prefixed under /api/v1) -----------------------
    app.include_router(course_courses.router)
    app.include_router(course_members.courses_member_router)
    app.include_router(course_members.invites_router)
    app.include_router(course_members.join_router)
    app.include_router(course_groups.router)
    app.include_router(course_homeworks.course_homeworks_router)
    app.include_router(course_homeworks.flat_router)
    app.include_router(course_assignments.course_assignments_router)
    app.include_router(course_assignments.flat_router)
    app.include_router(course_discovery.router)

    # --- Submission routers (mounted under /api/v1) -------------------------
    app.include_router(submission_submissions.router, prefix=API_BASE)
    app.include_router(submission_grading.router, prefix=API_BASE)
    app.include_router(submission_feedback.router, prefix=API_BASE)
    app.include_router(submission_flags.router, prefix=API_BASE)
    app.include_router(submission_self_service.router, prefix=API_BASE)
    app.include_router(submission_bulk.router, prefix=API_BASE)

    # --- Single shared health/metrics/version surface -----------------------
    app.include_router(health_router(service_name="course-submission", version="0.1.0"))
    return app


# Module-level ASGI app for uvicorn (`course_submission_service.main:app`),
# matching the entrypoint and the sibling services' convention.
app = create_app()


__all__ = ["app", "create_app", "lifespan", "wire_shared_session"]
