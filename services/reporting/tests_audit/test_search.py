from __future__ import annotations

from datetime import UTC, datetime

import pytest

from audit_service.services.consumer import process_event_for_test


def make_event(event_id: str, action: str, actor_id: str = "usr_42"):
    return {
        "specversion": "1.0",
        "id": event_id,
        "type": f"plaglens.identity.{action}.v1",
        "source": "/services/identity",
        "subject": f"users/{actor_id}",
        "time": datetime.now(UTC).isoformat(),
        "tenant_id": "tnt_test",
        "actor": {"type": "user", "id": actor_id, "role": "admin"},
        "trace_id": "trace_x",
        "data": {"user_id": actor_id},
    }


@pytest.mark.asyncio
async def test_search_q_matches_action(client, session_factory):
    await process_event_for_test(
        session_factory, make_event("e1", "user.password_changed")
    )
    await process_event_for_test(
        session_factory, make_event("e2", "user.role_assigned")
    )

    resp = await client.post(
        "/api/v1/audit/events:search",
        json={"q": "password_changed", "filters": {}, "aggregations": []},
        headers={"X-Test-Tenant-Id": "tnt_test"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["action"] == "user.password_changed"


@pytest.mark.asyncio
async def test_search_with_aggregation(client, session_factory):
    for i in range(3):
        await process_event_for_test(
            session_factory, make_event(f"a{i}", "user.password_changed")
        )
    for i in range(2):
        await process_event_for_test(
            session_factory, make_event(f"b{i}", "user.role_assigned")
        )

    resp = await client.post(
        "/api/v1/audit/events:search",
        json={"filters": {}, "aggregations": [{"type": "count", "by": "action"}]},
        headers={"X-Test-Tenant-Id": "tnt_test"},
    )
    assert resp.status_code == 200
    aggs = resp.json()["aggregations"]
    assert len(aggs) == 1
    keys = {b["key"]: b["count"] for b in aggs[0]["buckets"]}
    assert keys["user.password_changed"] == 3
    assert keys["user.role_assigned"] == 2
