"""Unit tests for the in-process CourseClient (merge seam)."""

from __future__ import annotations

from course_service.models import Assignment, Course
from course_submission_service.course_client import InProcessCourseClient


async def test_get_assignment_maps_fields_and_tenant(session_factory):
    async with session_factory() as s:
        course = Course(tenant_id="tnt_1", slug="algo", name="Algorithms", owner_id="usr_1")
        s.add(course)
        await s.flush()
        assignment = Assignment(
            course_id=course.id, slug="hw1", title="HW1", selection_strategy="best"
        )
        s.add(assignment)
        await s.commit()
        aid, cid = assignment.id, course.id

    client = InProcessCourseClient(session_factory)
    info = await client.get_assignment(str(aid))

    assert info is not None
    assert info.id == str(aid)
    assert info.course_id == str(cid)
    assert info.tenant_id == "tnt_1"  # pulled from Course, not Assignment
    assert info.selection_strategy == "best"


async def test_unknown_or_non_integer_id_returns_none(session_factory):
    client = InProcessCourseClient(session_factory)
    assert await client.get_assignment("999999") is None
    assert await client.get_assignment("not-an-int") is None
