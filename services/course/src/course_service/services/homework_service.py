"""Homework service: business logic for homework CRUD + reorder.

Emits Kafka events on the same `plaglens.course.course.v1` topic
(homeworks live inside courses):

- ``plaglens.course.homework.created.v1``
- ``plaglens.course.homework.updated.v1``
- ``plaglens.course.homework.deleted.v1``
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.events import build_envelope
from ..common.problem import ProblemException
from ..common.slug import slugify, unique_slug
from ..deps import CurrentUser
from ..events.producer import CourseEventPublisher
from ..models import Course, Homework
from ..repositories.homeworks import HomeworkRepository
from ..schemas.homework import HomeworkCreate, HomeworkUpdate


class HomeworkService:
    def __init__(
        self,
        session: AsyncSession,
        publisher: CourseEventPublisher,
    ) -> None:
        self.session = session
        self.publisher = publisher
        self.repo = HomeworkRepository(session)

    async def _publish(
        self,
        *,
        event_type: str,
        homework: Homework,
        course: Course,
        user: CurrentUser,
        data: dict[str, Any],
    ) -> None:
        payload = {"course_id": course.id, "homework_id": homework.id, **data}
        envelope = build_envelope(
            event_type=event_type,
            subject=f"homeworks/{homework.id}",
            tenant_id=course.tenant_id,
            actor={
                "type": "user",
                "id": user.user_id,
                "role": user.global_role,
            },
            data=payload,
        )
        await self.publisher.producer.publish(
            self.publisher.settings.kafka_topic_course, envelope
        )

    async def create(
        self, course: Course, payload: HomeworkCreate, user: CurrentUser
    ) -> Homework:
        # Slug auto-derived from the title — never user-typed. Any
        # client-provided ``payload.slug`` is ignored.
        base = await slugify(payload.title, fallback="homework")

        async def _taken(s: str) -> bool:
            return await self.repo.get_by_slug(course.id, s) is not None

        slug = await unique_slug(base, exists=_taken)
        homework = Homework(
            course_id=course.id,
            slug=slug,
            title=payload.title,
            description=payload.description,
            position=payload.position,
            status=payload.status,
            due_at=payload.due_at,
        )
        try:
            await self.repo.create(homework)
        except IntegrityError as exc:
            raise ProblemException(
                status_code=409, detail="Homework slug already used", code="CONFLICT"
            ) from exc
        await self._publish(
            event_type="plaglens.course.homework.created.v1",
            homework=homework,
            course=course,
            user=user,
            data={"slug": homework.slug, "title": homework.title},
        )
        return homework

    async def update(
        self,
        homework: Homework,
        course: Course,
        payload: HomeworkUpdate,
        user: CurrentUser,
    ) -> Homework:
        data = payload.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(homework, field, value)
        await self.session.flush()
        await self._publish(
            event_type="plaglens.course.homework.updated.v1",
            homework=homework,
            course=course,
            user=user,
            data={"changed_fields": sorted(data.keys())},
        )
        return homework

    async def delete(
        self, homework: Homework, course: Course, user: CurrentUser
    ) -> None:
        await self.repo.soft_delete(homework)
        await self._publish(
            event_type="plaglens.course.homework.deleted.v1",
            homework=homework,
            course=course,
            user=user,
            data={},
        )
