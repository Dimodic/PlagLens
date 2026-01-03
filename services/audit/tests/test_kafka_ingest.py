from __future__ import annotations

from datetime import UTC, datetime

import pytest

from audit_service.services.consumer import process_event_for_test


def make_event(*, event_id: str, action: str = "submission.created", tenant: str = "tnt_test"):
    return {
        "specversion": "1.0",
        "id": event_id,
        "type": f"plaglens.submission.{action}.v1",
        "source": "/services/submission",
        "subject": f"submissions/sub_{event_id}",
        "time": datetime.now(UTC).isoformat(),
        "tenant_id": tenant,
        "actor": {"type": "user", "id": "usr_42", "role": "owner"},
        "trace_id": "trace_abc",
        "data": {"submission_id": f"sub_{event_id}", "language": "python"},
    }


@pytest.mark.asyncio
async def test_ingest_kafka_then_query(client, session_factory):
    # Ingest two events from "Kafka".
    await process_event_for_test(session_factory, make_event(event_id="evt_1"))
    await process_event_for_test(
        session_factory,
        make_event(event_id="evt_2", action="submission.deleted"),
    )

    # List endpoint should now return both.
    resp = await client.get(
        "/api/v1/audit/events", headers={"X-Test-Tenant-Id": "tnt_test"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 2
    actions = {e["action"] for e in body["data"]}
    assert "submission.created" in actions
    assert "submission.deleted" in actions


@pytest.mark.asyncio
async def test_ingest_idempotent_by_event_id(client, session_factory):
    ev = make_event(event_id="evt_dup")
    await process_event_for_test(session_factory, ev)
    await process_event_for_test(session_factory, ev)
    await process_event_for_test(session_factory, ev)

    resp = await client.get(
        "/api/v1/audit/events", headers={"X-Test-Tenant-Id": "tnt_test"}
    )
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1


@pytest.mark.asyncio
async def test_list_filters(client, session_factory):
    await process_event_for_test(
        session_factory, make_event(event_id="evt_a", action="auth.login_success")
    )
    await process_event_for_test(
        session_factory, make_event(event_id="evt_b", action="rbac.access_denied")
    )

    resp = await client.get(
        "/api/v1/audit/events",
        params={"action": "rbac.access_denied"},
        headers={"X-Test-Tenant-Id": "tnt_test"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["action"] == "rbac.access_denied"

    # access-denied shortcut.
    resp = await client.get(
        "/api/v1/audit/access-denied",
        headers={"X-Test-Tenant-Id": "tnt_test"},
    )
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1
