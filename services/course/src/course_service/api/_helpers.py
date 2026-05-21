"""Shared helpers used by routers: dependency factories, fetchers."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.events import KafkaProducer
from ..common.pagination import decode_cursor
from ..common.problem import ProblemException
from ..common.redis_client import RedisClient
from ..config import Settings, get_settings
from ..deps import CurrentUser, get_current_user, get_session
from ..events.producer import CourseEventPublisher
from ..models import Assignment, Course, CourseInvitation, CourseMember, Group, Homework
from ..repositories.assignments import AssignmentRepository
from ..repositories.courses import CourseRepository
from ..repositories.groups import GroupRepository
from ..repositories.homeworks import HomeworkRepository
from ..repositories.invitations import InvitationRepository
from ..repositories.members import MemberRepository
from ..services.assignment_service import AssignmentService
from ..services.course_service import CourseService
from ..services.homework_service import HomeworkService
from ..services.integration_client import IntegrationClient

# ---- DI factories ----------------------------------------------------------

_publisher_singleton: dict[str, CourseEventPublisher] = {}
_producer_singleton: dict[str, KafkaProducer] = {}


def get_publisher(settings: Settings = Depends(get_settings)) -> CourseEventPublisher:
    pub = _publisher_singleton.get("inst")
    if pub is None:
        producer = _producer_singleton.get("inst") or KafkaProducer(
            settings.kafka_brokers, enabled=settings.kafka_enabled
        )
        _producer_singleton["inst"] = producer
        pub = CourseEventPublisher(producer, settings)
        _publisher_singleton["inst"] = pub
    return pub


def configure_publisher(publisher: CourseEventPublisher) -> None:
    """Test hook."""
    _publisher_singleton["inst"] = publisher


def reset_publisher() -> None:
    _publisher_singleton.clear()
    _producer_singleton.clear()


def get_integration_client(
    settings: Settings = Depends(get_settings),
) -> IntegrationClient:
    return IntegrationClient(settings)


def get_redis(request: Request) -> RedisClient | None:
    return getattr(request.app.state, "redis", None)


def get_course_service(
    request: Request,
    session: AsyncSession = Depends(get_session),
    publisher: CourseEventPublisher = Depends(get_publisher),
) -> CourseService:
    redis = getattr(request.app.state, "redis", None)
    return CourseService(session, publisher, redis=redis)


def get_assignment_service(
    session: AsyncSession = Depends(get_session),
    publisher: CourseEventPublisher = Depends(get_publisher),
    integration: IntegrationClient = Depends(get_integration_client),
) -> AssignmentService:
    return AssignmentService(session, publisher, integration)


def get_homework_service(
    session: AsyncSession = Depends(get_session),
    publisher: CourseEventPublisher = Depends(get_publisher),
) -> HomeworkService:
    return HomeworkService(session, publisher)


# ---- Pagination helpers ---------------------------------------------------


def parse_limit(limit: int = Query(default=50, ge=1, le=2000)) -> int:
    # Cap raised to 2000 so course-detail screens can fetch the full
    # per-homework assignment set in one shot (Y.Contest courses easily
    # push past 200 across multiple imported contests). Beyond that the
    # caller should switch to cursor pagination.
    return limit


def parse_cursor_id(cursor: str | None = Query(default=None)) -> int | None:
    payload = decode_cursor(cursor)
    if not payload:
        return None
    cid = payload.get("id")
    return int(cid) if cid is not None else None


# ---- Resource fetchers ----------------------------------------------------


async def fetch_course(
    course_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    include_deleted: bool = Query(default=False, alias="include_deleted"),
) -> Course:
    repo = CourseRepository(session)
    if user.global_role == "admin":
        course = await repo.get(course_id, include_deleted=include_deleted)
    else:
        course = await repo.get_in_tenant(
            course_id, user.tenant_id, include_deleted=include_deleted
        )
    if course is None:
        raise ProblemException(status_code=404, detail="Course not found", code="NOT_FOUND")
    return course


async def fetch_assignment(
    assignment_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Assignment:
    repo = AssignmentRepository(session)
    assignment = await repo.get(assignment_id)
    if assignment is None:
        raise ProblemException(
            status_code=404, detail="Assignment not found", code="NOT_FOUND"
        )
    crepo = CourseRepository(session)
    course = await crepo.get(assignment.course_id, include_deleted=True)
    if course is None or (
        user.global_role != "admin" and course.tenant_id != user.tenant_id
    ):
        raise ProblemException(
            status_code=404, detail="Assignment not found", code="NOT_FOUND"
        )
    return assignment


async def fetch_member(
    course: Course,
    member_user_id: str,
    session: AsyncSession,
) -> CourseMember:
    repo = MemberRepository(session)
    member = await repo.get_member(course.id, member_user_id)
    if member is None:
        raise ProblemException(
            status_code=404, detail="Member not found", code="NOT_FOUND"
        )
    return member


async def fetch_invitation(
    course: Course,
    invitation_id: int,
    session: AsyncSession,
) -> CourseInvitation:
    repo = InvitationRepository(session)
    inv = await repo.get(course.id, invitation_id)
    if inv is None:
        raise ProblemException(
            status_code=404, detail="Invitation not found", code="NOT_FOUND"
        )
    return inv


async def fetch_group(
    course: Course,
    group_id: int,
    session: AsyncSession,
) -> Group:
    repo = GroupRepository(session)
    grp = await repo.get(course.id, group_id)
    if grp is None:
        raise ProblemException(status_code=404, detail="Group not found", code="NOT_FOUND")
    return grp


async def fetch_homework(
    homework_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Homework:
    repo = HomeworkRepository(session)
    homework = await repo.get(homework_id)
    if homework is None:
        raise ProblemException(
            status_code=404, detail="Homework not found", code="NOT_FOUND"
        )
    crepo = CourseRepository(session)
    course = await crepo.get(homework.course_id, include_deleted=True)
    if course is None or (
        user.global_role != "admin" and course.tenant_id != user.tenant_id
    ):
        raise ProblemException(
            status_code=404, detail="Homework not found", code="NOT_FOUND"
        )
    return homework


# ---- Bearer extraction (for IntegrationClient passthrough) ---------------


async def get_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


# ---- Re-exports for type aliases ------------------------------------------

UserDep = Annotated[CurrentUser, Depends(get_current_user)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
CourseDep = Annotated[Course, Depends(fetch_course)]
AssignmentDep = Annotated[Assignment, Depends(fetch_assignment)]
HomeworkDep = Annotated[Homework, Depends(fetch_homework)]
CourseSvcDep = Annotated[CourseService, Depends(get_course_service)]
AssignmentSvcDep = Annotated[AssignmentService, Depends(get_assignment_service)]
HomeworkSvcDep = Annotated[HomeworkService, Depends(get_homework_service)]


async def session_iter() -> AsyncIterator[AsyncSession]:  # pragma: no cover
    async for s in get_session():  # type: ignore[misc]
        yield s
