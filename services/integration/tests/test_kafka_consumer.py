"""Smoke test for Kafka event handlers (using bus.captured fallback)."""
from __future__ import annotations

from integration_service.services.events_consumer import (
    handle_assignment_created,
    handle_course_deleted,
    handle_tenant_deleted,
)


async def test_handle_assignment_created_idempotent(db_session):
    await handle_assignment_created(
        {
            "id": "evt-1",
            "type": "course.assignment.created.v1",
            "data": {
                "course_id": "crs_1",
                "assignment_id": "asg_1",
                "external_bindings": [{"kind": "manual"}],
            },
        }
    )
    # Second call with same id is a no-op (idempotent).
    await handle_assignment_created(
        {
            "id": "evt-1",
            "type": "course.assignment.created.v1",
            "data": {"course_id": "crs_1", "assignment_id": "asg_1", "external_bindings": []},
        }
    )


async def test_handle_course_and_tenant_deletion(db_session):
    await handle_course_deleted({"id": "evt-2", "data": {"course_id": "crs_x"}})
    await handle_tenant_deleted(
        {"id": "evt-3", "tenant_id": "tnt_y", "data": {"tenant_id": "tnt_y"}}
    )


async def test_published_events_via_bus(bus):
    await bus.publish(
        "plaglens.integration.import.v1",
        "integration.import.started.v1",
        {"x": 1},
        tenant_id="tnt_1",
    )
    assert bus.captured
    assert bus.captured[-1]["envelope"]["type"] == "integration.import.started.v1"
