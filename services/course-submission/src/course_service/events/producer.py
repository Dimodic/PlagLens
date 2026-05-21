"""Course-domain event publisher (thin layer over common.KafkaProducer)."""

from __future__ import annotations

from typing import Any

from ..common.events import KafkaProducer, build_envelope
from ..config import Settings


class CourseEventPublisher:
    def __init__(self, producer: KafkaProducer, settings: Settings) -> None:
        self.producer = producer
        self.settings = settings

    async def publish_course(
        self,
        *,
        event_type: str,
        course_id: int,
        tenant_id: str,
        actor_id: str,
        actor_role: str,
        data: dict[str, Any],
        trace_id: str | None = None,
    ) -> None:
        envelope = build_envelope(
            event_type=event_type,
            subject=f"courses/{course_id}",
            tenant_id=tenant_id,
            actor={"type": "user", "id": actor_id, "role": actor_role},
            data=data,
            trace_id=trace_id,
        )
        await self.producer.publish(self.settings.kafka_topic_course, envelope)

    async def publish_assignment(
        self,
        *,
        event_type: str,
        assignment_id: int,
        course_id: int,
        tenant_id: str,
        actor_id: str,
        actor_role: str,
        data: dict[str, Any],
        trace_id: str | None = None,
    ) -> None:
        payload = {"course_id": course_id, **data}
        envelope = build_envelope(
            event_type=event_type,
            subject=f"assignments/{assignment_id}",
            tenant_id=tenant_id,
            actor={"type": "user", "id": actor_id, "role": actor_role},
            data=payload,
            trace_id=trace_id,
        )
        await self.producer.publish(self.settings.kafka_topic_assignment, envelope)
