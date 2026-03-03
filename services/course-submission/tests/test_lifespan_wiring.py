"""wire_shared_session points both services at one factory + the in-process client."""

from __future__ import annotations

import course_service.deps as course_deps
import submission_service.api.deps as submission_api_deps
import submission_service.db as submission_db

from course_submission_service.course_client import InProcessCourseClient
from course_submission_service.main import wire_shared_session


async def test_wire_shared_session_binds_both_services(session_factory):
    wire_shared_session(session_factory)

    assert course_deps._engine_cache["factory"] is session_factory
    assert submission_db.get_session_factory() is session_factory
    assert isinstance(submission_api_deps.get_course_client(), InProcessCourseClient)
