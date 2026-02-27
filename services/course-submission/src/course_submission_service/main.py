"""Combined FastAPI app for the merged course+submission service.

Assembly in progress: this mounts the existing course and submission routers
into a single app and registers the shared RFC 7807 handlers. The shared-engine
lifespan + ``InProcessCourseClient`` wiring is added in a follow-up step.
"""

from __future__ import annotations

from course_service.api import assignments as course_assignments
from course_service.api import courses as course_courses
from course_service.api import discovery as course_discovery
from course_service.api import groups as course_groups
from course_service.api import homeworks as course_homeworks
from course_service.api import members as course_members
from fastapi import FastAPI
from plaglens_common.health import health_router
from plaglens_common.problem import make_handlers
from submission_service.api.routers import bulk as submission_bulk
from submission_service.api.routers import feedback as submission_feedback
from submission_service.api.routers import flags as submission_flags
from submission_service.api.routers import grading as submission_grading
from submission_service.api.routers import self_service as submission_self_service
from submission_service.api.routers import submissions as submission_submissions

API_BASE = "/api/v1"


def create_app() -> FastAPI:
    app = FastAPI(title="PlagLens Course+Submission Service", version="0.1.0")

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


__all__ = ["create_app"]
