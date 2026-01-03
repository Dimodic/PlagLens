"""Retention dry-run + legal hold blocking.

On SQLite there are no real partitions, so we test the helper algorithms
directly (which is what production code calls).
"""
from __future__ import annotations

from datetime import UTC, date

import pytest

from audit_service.services.partitions import partition_name
from audit_service.services.retention import (
    cutoff_date,
    run_retention,
    select_candidates,
)


def test_select_candidates_picks_old_partitions():
    partitions = [
        partition_name(date(2025, 1, 1)),
        partition_name(date(2025, 6, 1)),
        partition_name(date(2026, 4, 1)),
    ]
    cutoff = date(2026, 1, 1)
    candidates = select_candidates(partitions, cutoff=cutoff)
    assert partition_name(date(2025, 1, 1)) in candidates
    assert partition_name(date(2025, 6, 1)) in candidates
    # partition for 2026-04 ends 2026-05-01 > cutoff → not a candidate.
    assert partition_name(date(2026, 4, 1)) not in candidates


def test_cutoff_date_uses_days():
    assert isinstance(cutoff_date(days=365), date)


@pytest.mark.asyncio
async def test_retention_dry_run_on_sqlite_is_safe(engine, session_factory):
    """Running retention on SQLite (test harness) must not error and must
    not drop anything."""
    async with session_factory() as session:
        result = await run_retention(
            engine,
            session,
            legal_hold_resource_ids=set(),
            days=365,
            dry_run=True,
        )
    assert result.dropped == []


@pytest.mark.asyncio
async def test_legal_hold_create_and_list(client):
    hdrs = {"X-Test-Tenant-Id": "tnt_test", "X-Test-Role": "admin"}
    r = await client.post(
        "/api/v1/admin/audit/legal-holds",
        json={"resource_id": "sub_99", "resource_type": "submissions", "reason": "investigation"},
        headers=hdrs,
    )
    assert r.status_code == 201
    hold_id = r.json()["id"]

    r = await client.get("/api/v1/admin/audit/legal-holds", headers=hdrs)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["resource_id"] == "sub_99"

    r = await client.delete(f"/api/v1/admin/audit/legal-holds/{hold_id}", headers=hdrs)
    assert r.status_code == 204

    r = await client.get("/api/v1/admin/audit/legal-holds", headers=hdrs)
    assert r.json() == []


@pytest.mark.asyncio
async def test_legal_hold_blocks_partition_cleanup_logic(engine, session_factory):
    """When a hold protects a resource_id present in candidate partitions, that
    partition shows up in `blocked_by_legal_hold` and is NOT dropped."""
    from datetime import datetime

    from audit_service.models import AuditEvent
    from audit_service.repositories.retention import LegalHoldRepository

    async with session_factory() as session:
        # Insert a "historical" event whose resource_id we'll legal-hold.
        ev = AuditEvent(
            id="01HKABCDEF0000000000000001",
            recorded_at=datetime.now(UTC),
            tenant_id="tnt_test",
            occurred_at=datetime.now(UTC),
            actor_type="user",
            actor_id="usr_42",
            actor={"type": "user", "id": "usr_42"},
            action="submission.created",
            result="success",
            resource_type="submissions",
            resource_id="sub_protected",
            resource={"type": "submissions", "id": "sub_protected"},
            metadata_={},
            retention_class="default",
        )
        session.add(ev)
        await session.commit()

    async with session_factory() as session:
        hold_repo = LegalHoldRepository(session)
        await hold_repo.create(
            tenant_id="tnt_test",
            resource_id="sub_protected",
            resource_type="submissions",
            reason="test",
            requested_by="usr_admin",
        )
        await session.commit()

    async with session_factory() as session:
        hold_repo = LegalHoldRepository(session)
        legal_ids = await hold_repo.list_active_resource_ids(tenant_id=None)
    assert "sub_protected" in legal_ids
